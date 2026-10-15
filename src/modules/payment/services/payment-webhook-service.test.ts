import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  WebhookSignatureError,
  type OrderStatus,
  type PaymentWebhookEvent,
  type PaymentWebhookGateway,
  type ReservationStatus,
} from "@/modules/payment/payment.types";
import {
  cancelRefundedOrder,
  findPaymentContext,
  fulfillOrder,
  type FulfillOrderInput,
  type PaymentContext,
} from "@/modules/payment/services/payment-fulfillment-service";
import { handlePaymentWebhook } from "@/modules/payment/services/payment-webhook-service";
import {
  hasProcessedStripeEvent,
  markStripeEventProcessed,
} from "@/modules/payment/services/stripe-event-service";
import { confirmRefund } from "@/modules/refund/services/refund-service";

vi.mock("@/modules/payment/services/payment-fulfillment-service", () => ({
  findPaymentContext: vi.fn(),
  fulfillOrder: vi.fn(),
  cancelRefundedOrder: vi.fn(),
}));
vi.mock("@/modules/payment/services/stripe-event-service", () => ({
  hasProcessedStripeEvent: vi.fn(),
  markStripeEventProcessed: vi.fn(),
}));
vi.mock("@/modules/refund/services/refund-service", () => ({ confirmRefund: vi.fn() }));
// The real gateway pulls in the Stripe SDK; tests inject a fake instead.
vi.mock("@/modules/payment/services/stripe-payment-gateway", () => ({ stripePaymentGateway: {} }));

const SUCCEEDED = "payment_intent.succeeded";
const BUYER = "Ana Pérez";
const ITEMS = ["item-1", "item-2", "item-3"];

const succeededEvent: PaymentWebhookEvent = { id: "evt_1", type: SUCCEEDED, paymentIntentId: "pi_1", chargeId: "ch_1" };

function paymentContext(overrides: Partial<PaymentContext> = {}): PaymentContext {
  return {
    paymentId: "pay-1",
    orderId: "order-1",
    orderStatus: "pending",
    eventId: "event-1",
    buyerName: BUYER,
    reservationId: "res-1",
    reservationStatus: "active",
    orderItemIds: ITEMS,
    ...overrides,
  };
}

/** What the Postgres driver throws when a statement of the batch fails. */
function pgError(code: string) {
  return { code };
}

const gateway = {
  parseWebhook: vi.fn(),
  refundPayment: vi.fn(),
} satisfies PaymentWebhookGateway;

function deliver(signature: string | null = "sig") {
  return handlePaymentWebhook("{}", signature, gateway);
}

/** Every console call, flattened, to check that logs carry no personal data (D12). */
function loggedText() {
  return JSON.stringify([console.info, console.warn, console.error].map((log) => vi.mocked(log).mock.calls));
}

/**
 * In-memory stand-in for the DB: the conversion batch registers the event and converts the order
 * atomically, failing like Postgres when the event is already recorded (23505) or the order is no
 * longer `pending` (22012). The state changes synchronously, before the first await.
 */
function statefulStore() {
  const processed = new Set<string>();
  const order: { status: OrderStatus; reservation: ReservationStatus } = { status: "pending", reservation: "active" };
  const issued: FulfillOrderInput["tickets"] = [];

  vi.mocked(hasProcessedStripeEvent).mockImplementation(async (id) => processed.has(id));
  vi.mocked(markStripeEventProcessed).mockImplementation(async (id) => {
    processed.add(id);
  });
  vi.mocked(findPaymentContext).mockImplementation(async () =>
    paymentContext({ orderStatus: order.status, reservationStatus: order.reservation }),
  );
  vi.mocked(fulfillOrder).mockImplementation(async ({ stripeEvent, tickets }) => {
    if (processed.has(stripeEvent.id)) throw pgError("23505");
    if (order.status !== "pending") throw pgError("22012");
    processed.add(stripeEvent.id);
    order.status = "paid";
    order.reservation = "converted";
    issued.push(...tickets);
  });

  return { processed, issued };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  gateway.parseWebhook.mockReturnValue(succeededEvent);
  gateway.refundPayment.mockResolvedValue({ refundId: "re_1" });
  vi.mocked(hasProcessedStripeEvent).mockResolvedValue(false);
  vi.mocked(findPaymentContext).mockResolvedValue(paymentContext());
});

function expectNoDataAccess() {
  expect(hasProcessedStripeEvent).not.toHaveBeenCalled();
  expect(findPaymentContext).not.toHaveBeenCalled();
  expect(fulfillOrder).not.toHaveBeenCalled();
  expect(cancelRefundedOrder).not.toHaveBeenCalled();
  expect(markStripeEventProcessed).not.toHaveBeenCalled();
}

function expectRefundedAndRecorded(eventId = "evt_1") {
  expect(gateway.refundPayment).toHaveBeenCalledWith("pi_1", "refund:order-1");
  expect(cancelRefundedOrder).toHaveBeenCalledWith({ paymentId: "pay-1", orderId: "order-1", chargeId: "ch_1" });
  expect(console.warn).toHaveBeenCalledWith(expect.any(String), "order-1", "re_1");
  expect(markStripeEventProcessed).toHaveBeenCalledWith(eventId, SUCCEEDED);
}

describe("handlePaymentWebhook: verification and ignored events", () => {
  it("returns 400 without calling the gateway when the signature is missing", async () => {
    expect(await deliver(null)).toEqual({ status: 400 });
    expect(gateway.parseWebhook).not.toHaveBeenCalled();
    expectNoDataAccess();
  });

  it("returns 400 without touching the DB when the signature is invalid", async () => {
    gateway.parseWebhook.mockImplementation(() => {
      throw new WebhookSignatureError();
    });

    expect(await deliver("bad")).toEqual({ status: 400 });
    expectNoDataAccess();
  });

  it("returns 500 on a configuration error from the gateway", async () => {
    gateway.parseWebhook.mockImplementation(() => {
      throw new Error("Webhook secret is not set.");
    });

    expect(await deliver()).toEqual({ status: 500 });
    expectNoDataAccess();
  });

  it("ignores irrelevant event types without touching the DB", async () => {
    gateway.parseWebhook.mockReturnValue({ id: "evt_2", type: "charge.succeeded", paymentIntentId: null, chargeId: null });

    expect(await deliver()).toEqual({ status: 200 });
    expectNoDataAccess();
  });

  it("ignores a succeeded event without a PaymentIntent", async () => {
    gateway.parseWebhook.mockReturnValue({ ...succeededEvent, paymentIntentId: null });

    expect(await deliver()).toEqual({ status: 200 });
    expectNoDataAccess();
  });

  it("only logs a failed payment: the order stays pending for the retry (D9)", async () => {
    gateway.parseWebhook.mockReturnValue({
      id: "evt_3",
      type: "payment_intent.payment_failed",
      paymentIntentId: "pi_1",
      chargeId: "ch_1",
    });

    expect(await deliver()).toEqual({ status: 200 });
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining("[stripe]"), "evt_3", "pi_1");
    expectNoDataAccess();
  });

  it("does not repeat work for an event already processed", async () => {
    vi.mocked(hasProcessedStripeEvent).mockResolvedValue(true);

    expect(await deliver()).toEqual({ status: 200 });
    expect(hasProcessedStripeEvent).toHaveBeenCalledWith("evt_1");
    expect(findPaymentContext).not.toHaveBeenCalled();
  });

  it("records an unknown PaymentIntent and returns 200", async () => {
    vi.mocked(findPaymentContext).mockResolvedValue(null);

    expect(await deliver()).toEqual({ status: 200 });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("[stripe]"), "evt_1", "pi_1");
    expect(markStripeEventProcessed).toHaveBeenCalledWith("evt_1", SUCCEEDED);
    expect(fulfillOrder).not.toHaveBeenCalled();
    expect(gateway.refundPayment).not.toHaveBeenCalled();
  });
});

describe("handlePaymentWebhook: conversion", () => {
  it("converts the order with one ticket per item and records the event inside the batch", async () => {
    expect(await deliver()).toEqual({ status: 200 });

    expect(findPaymentContext).toHaveBeenCalledWith("pi_1");
    expect(fulfillOrder).toHaveBeenCalledTimes(1);
    const input = vi.mocked(fulfillOrder).mock.calls[0][0];
    expect(input).toMatchObject({
      stripeEvent: { id: "evt_1", type: SUCCEEDED },
      paymentId: "pay-1",
      orderId: "order-1",
      reservationId: "res-1",
      chargeId: "ch_1",
    });
    expect(input.tickets.map((ticket) => ticket.orderItemId)).toEqual(ITEMS);
    expect(input.tickets.every((ticket) => ticket.eventId === "event-1" && ticket.holderName === BUYER)).toBe(true);
    expect(new Set(input.tickets.map((ticket) => ticket.code)).size).toBe(ITEMS.length);
    expect(markStripeEventProcessed).not.toHaveBeenCalled();
    expect(gateway.refundPayment).not.toHaveBeenCalled();
  });

  it("issues the tickets once when the same event is delivered twice", async () => {
    const store = statefulStore();

    expect(await deliver()).toEqual({ status: 200 });
    expect(await deliver()).toEqual({ status: 200 });

    expect(fulfillOrder).toHaveBeenCalledTimes(1);
    expect(store.issued.map((ticket) => ticket.orderItemId)).toEqual(ITEMS);
    expect(store.processed).toEqual(new Set(["evt_1"]));
    expect(gateway.refundPayment).not.toHaveBeenCalled();
    expect(cancelRefundedOrder).not.toHaveBeenCalled();
  });

  it("converts once when two deliveries of the same event race", async () => {
    const store = statefulStore();
    vi.mocked(hasProcessedStripeEvent).mockResolvedValue(false);

    expect(await Promise.all([deliver(), deliver()])).toEqual([{ status: 200 }, { status: 200 }]);

    // Both pass the fast path; the loser aborts with 23505, rereads the paid order and records.
    expect(fulfillOrder).toHaveBeenCalledTimes(2);
    expect(findPaymentContext).toHaveBeenCalledTimes(3);
    expect(store.issued.map((ticket) => ticket.orderItemId)).toEqual(ITEMS);
    expect(markStripeEventProcessed).toHaveBeenCalledWith("evt_1", SUCCEEDED);
    expect(gateway.refundPayment).not.toHaveBeenCalled();
  });

  it("only records a different event of an order already paid", async () => {
    gateway.parseWebhook.mockReturnValue({ ...succeededEvent, id: "evt_2" });
    vi.mocked(findPaymentContext).mockResolvedValue(
      paymentContext({ orderStatus: "paid", reservationStatus: "converted" }),
    );

    expect(await deliver()).toEqual({ status: 200 });
    expect(markStripeEventProcessed).toHaveBeenCalledWith("evt_2", SUCCEEDED);
    expect(fulfillOrder).not.toHaveBeenCalled();
    expect(gateway.refundPayment).not.toHaveBeenCalled();
  });
});

describe("handlePaymentWebhook: lost hold (refund)", () => {
  it("refunds, then cancels, then records when the reservation expired before the charge", async () => {
    vi.mocked(findPaymentContext).mockResolvedValue(paymentContext({ reservationStatus: "expired" }));
    const steps: string[] = [];
    gateway.refundPayment.mockImplementation(async () => {
      steps.push("refund");
      return { refundId: "re_1" };
    });
    vi.mocked(cancelRefundedOrder).mockImplementation(async () => {
      steps.push("cancel");
    });
    vi.mocked(markStripeEventProcessed).mockImplementation(async () => {
      steps.push("record");
    });

    expect(await deliver()).toEqual({ status: 200 });
    expect(steps).toEqual(["refund", "cancel", "record"]);
    expectRefundedAndRecorded();
    expect(fulfillOrder).not.toHaveBeenCalled();
    expect(loggedText()).not.toContain(BUYER);
  });

  it("refunds an order already cancelled", async () => {
    vi.mocked(findPaymentContext).mockResolvedValue(paymentContext({ orderStatus: "cancelled" }));

    expect(await deliver()).toEqual({ status: 200 });
    expectRefundedAndRecorded();
    expect(fulfillOrder).not.toHaveBeenCalled();
  });

  it("returns 500 without cancelling or recording when the refund fails, and the retry completes", async () => {
    vi.mocked(findPaymentContext).mockResolvedValue(paymentContext({ reservationStatus: "released" }));
    gateway.refundPayment.mockRejectedValueOnce(new Error("stripe down"));

    expect(await deliver()).toEqual({ status: 500 });
    expect(cancelRefundedOrder).not.toHaveBeenCalled();
    expect(markStripeEventProcessed).not.toHaveBeenCalled();

    expect(await deliver()).toEqual({ status: 200 });
    expect(gateway.refundPayment).toHaveBeenCalledTimes(2);
    expect(gateway.refundPayment).toHaveBeenNthCalledWith(1, "pi_1", "refund:order-1");
    expect(gateway.refundPayment).toHaveBeenNthCalledWith(2, "pi_1", "refund:order-1");
    expect(cancelRefundedOrder).toHaveBeenCalledTimes(1);
    expect(markStripeEventProcessed).toHaveBeenCalledTimes(1);
  });
});

describe("handlePaymentWebhook: aborted conversion (D7)", () => {
  function abortThenReread(code: string, reread: PaymentContext | null) {
    vi.mocked(fulfillOrder).mockRejectedValue(pgError(code));
    vi.mocked(findPaymentContext).mockResolvedValueOnce(paymentContext()).mockResolvedValueOnce(reread);
  }

  it("records without refunding when the reread shows the order paid (22012)", async () => {
    abortThenReread("22012", paymentContext({ orderStatus: "paid", reservationStatus: "converted" }));

    expect(await deliver()).toEqual({ status: 200 });
    expect(findPaymentContext).toHaveBeenCalledTimes(2);
    expect(markStripeEventProcessed).toHaveBeenCalledWith("evt_1", SUCCEEDED);
    expect(gateway.refundPayment).not.toHaveBeenCalled();
    expect(cancelRefundedOrder).not.toHaveBeenCalled();
  });

  it("refunds when the reread shows the reservation released (22012)", async () => {
    abortThenReread("22012", paymentContext({ reservationStatus: "released" }));

    expect(await deliver()).toEqual({ status: 200 });
    expect(findPaymentContext).toHaveBeenCalledTimes(2);
    expectRefundedAndRecorded();
    expect(console.error).not.toHaveBeenCalled();
  });

  it.each(["22012", "23514"])(
    "logs and refunds when the order is still pending + active after %s (inventory mismatch)",
    async (code) => {
      abortThenReread(code, paymentContext());

      expect(await deliver()).toEqual({ status: 200 });
      expect(fulfillOrder).toHaveBeenCalledTimes(1);
      expect(findPaymentContext).toHaveBeenCalledTimes(2);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("[stripe]"), "order-1", expect.any(String));
      expectRefundedAndRecorded();
      expect(loggedText()).not.toContain(BUYER);
    },
  );

  it("returns 500 without refunding or recording on a 23505 with the order still pending + active", async () => {
    abortThenReread("23505", paymentContext());

    expect(await deliver()).toEqual({ status: 500 });
    expect(findPaymentContext).toHaveBeenCalledTimes(2);
    expect(gateway.refundPayment).not.toHaveBeenCalled();
    expect(cancelRefundedOrder).not.toHaveBeenCalled();
    expect(markStripeEventProcessed).not.toHaveBeenCalled();
  });

  it("returns 500 when the reread finds no payment", async () => {
    abortThenReread("22012", null);

    expect(await deliver()).toEqual({ status: 500 });
    expect(gateway.refundPayment).not.toHaveBeenCalled();
    expect(markStripeEventProcessed).not.toHaveBeenCalled();
  });

  it("returns 500 without rereading, refunding or recording on an unclassified DB error", async () => {
    vi.mocked(fulfillOrder).mockRejectedValue(new Error("connection reset"));

    expect(await deliver()).toEqual({ status: 500 });
    expect(findPaymentContext).toHaveBeenCalledTimes(1);
    expect(gateway.refundPayment).not.toHaveBeenCalled();
    expect(cancelRefundedOrder).not.toHaveBeenCalled();
    expect(markStripeEventProcessed).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("[stripe] payment webhook failed", "connection reset");
  });
});

describe("handlePaymentWebhook: refund events (D5)", () => {
  const refund = { id: "re_9", status: "succeeded", metadataRefundId: "refund-row-1" };

  function refundEvent(type: string, overrides: Partial<PaymentWebhookEvent> = {}): PaymentWebhookEvent {
    return { id: "evt_r1", type, paymentIntentId: null, chargeId: null, refund, ...overrides };
  }

  it.each(["refund.created", "refund.updated", "refund.failed"])(
    "delegates %s to confirmRefund and answers 200",
    async (type) => {
      gateway.parseWebhook.mockReturnValue(refundEvent(type));

      expect(await deliver()).toEqual({ status: 200 });
      expect(hasProcessedStripeEvent).toHaveBeenCalledWith("evt_r1");
      expect(confirmRefund).toHaveBeenCalledTimes(1);
      expect(confirmRefund).toHaveBeenCalledWith({ id: "evt_r1", type, refund });
      expect(findPaymentContext).not.toHaveBeenCalled();
      expect(fulfillOrder).not.toHaveBeenCalled();
      expect(gateway.refundPayment).not.toHaveBeenCalled();
    },
  );

  it("does not call confirmRefund for an event already processed", async () => {
    gateway.parseWebhook.mockReturnValue(refundEvent("refund.updated"));
    vi.mocked(hasProcessedStripeEvent).mockResolvedValue(true);

    expect(await deliver()).toEqual({ status: 200 });
    expect(confirmRefund).not.toHaveBeenCalled();
  });

  it("ignores a refund event without a refund object", async () => {
    gateway.parseWebhook.mockReturnValue(refundEvent("refund.updated", { refund: undefined }));

    expect(await deliver()).toEqual({ status: 200 });
    expect(hasProcessedStripeEvent).not.toHaveBeenCalled();
    expect(confirmRefund).not.toHaveBeenCalled();
  });

  it("returns 500 when confirmRefund fails, and the retry completes", async () => {
    gateway.parseWebhook.mockReturnValue(refundEvent("refund.updated"));
    vi.mocked(confirmRefund).mockRejectedValueOnce(new Error("db down"));

    expect(await deliver()).toEqual({ status: 500 });
    expect(console.error).toHaveBeenCalledWith("[stripe] payment webhook failed", "db down");

    expect(await deliver()).toEqual({ status: 200 });
    expect(confirmRefund).toHaveBeenCalledTimes(2);
  });

  it("returns 400 without touching refunds when the signature is invalid", async () => {
    gateway.parseWebhook.mockImplementation(() => {
      throw new WebhookSignatureError();
    });

    expect(await deliver("bad")).toEqual({ status: 400 });
    expect(confirmRefund).not.toHaveBeenCalled();
    expect(hasProcessedStripeEvent).not.toHaveBeenCalled();
  });

  it("leaves payment_intent.succeeded untouched by the refund path", async () => {
    expect(await deliver()).toEqual({ status: 200 });
    expect(fulfillOrder).toHaveBeenCalledTimes(1);
    expect(confirmRefund).not.toHaveBeenCalled();
  });
});
