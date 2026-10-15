import type { BatchItem } from "drizzle-orm/batch";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { hasProcessedStripeEvent, markStripeEventProcessed } from "@/modules/payment/services/stripe-event-service";
import type { DispatchableRefund, RefundWebhookEvent, WebhookRefundRow } from "@/modules/refund/refund.types";
import {
  cancelEventBatch,
  ensureEventRefunds,
  finalizeRefundBatch,
  findRefundForWebhook,
  listDispatchableRefunds,
  refundEventTickets,
  saveStripeRefundId,
} from "@/modules/refund/services/refund-data-service";
import {
  cancelEventAndRefund,
  confirmRefund,
  dispatchEventRefunds,
  retryEventRefunds,
} from "@/modules/refund/services/refund-service";

vi.mock("@/modules/refund/services/refund-data-service", () => ({
  cancelEventBatch: vi.fn(),
  ensureEventRefunds: vi.fn(),
  refundEventTickets: vi.fn(),
  listDispatchableRefunds: vi.fn(),
  saveStripeRefundId: vi.fn(),
  findRefundForWebhook: vi.fn(),
  finalizeRefundBatch: vi.fn(),
}));
vi.mock("@/modules/payment/services/stripe-event-service", () => ({
  hasProcessedStripeEvent: vi.fn(),
  markStripeEventProcessed: vi.fn(),
}));
// The real gateway pulls in the Stripe SDK; tests inject a fake instead.
vi.mock("@/modules/payment/services/stripe-payment-gateway", () => ({ stripePaymentGateway: {} }));

const EVENT_ID = "event-1";
const USER_ID = "user-1";
const cas = {} as BatchItem<"pg">;

const gateway = { refundPayment: vi.fn() };

const refundOf = (n: number): DispatchableRefund => ({ id: `r-${n}`, paymentIntentId: `pi_${n}` });

/** Every console call, flattened, to check that logs carry no personal data. */
function loggedText() {
  return JSON.stringify([console.info, console.warn, console.error].map((log) => vi.mocked(log).mock.calls));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  gateway.refundPayment.mockImplementation(async (paymentIntentId: string) => ({
    refundId: `re_${paymentIntentId}`,
  }));
});

describe("dispatchEventRefunds", () => {
  it("asks Stripe once per pending refund with its key and metadata, and stores the id", async () => {
    vi.mocked(listDispatchableRefunds).mockResolvedValue([refundOf(1), refundOf(2)]);

    const result = await dispatchEventRefunds(EVENT_ID, gateway);

    expect(result).toEqual({ dispatched: 2, failed: 0, pending: 0 });
    expect(gateway.refundPayment).toHaveBeenCalledTimes(2);
    expect(gateway.refundPayment).toHaveBeenNthCalledWith(1, "pi_1", "refund-row:r-1", { metadata: { refund_id: "r-1" } });
    expect(gateway.refundPayment).toHaveBeenNthCalledWith(2, "pi_2", "refund-row:r-2", { metadata: { refund_id: "r-2" } });
    expect(saveStripeRefundId).toHaveBeenCalledWith("r-1", "re_pi_1");
    expect(saveStripeRefundId).toHaveBeenCalledWith("r-2", "re_pi_2");
  });

  it("does not call Stripe when nothing is pending (refunds with an id are not listed)", async () => {
    vi.mocked(listDispatchableRefunds).mockResolvedValue([]);

    expect(await dispatchEventRefunds(EVENT_ID, gateway)).toEqual({ dispatched: 0, failed: 0, pending: 0 });
    expect(gateway.refundPayment).not.toHaveBeenCalled();
  });

  it("keeps going after a failure, counts it, and logs no personal data", async () => {
    vi.mocked(listDispatchableRefunds).mockResolvedValue([refundOf(1), refundOf(2), refundOf(3)]);
    gateway.refundPayment.mockImplementation(async (paymentIntentId: string) => {
      if (paymentIntentId === "pi_2") throw new Error("insufficient funds");
      return { refundId: `re_${paymentIntentId}` };
    });

    const result = await dispatchEventRefunds(EVENT_ID, gateway);

    expect(result).toEqual({ dispatched: 2, failed: 1, pending: 1 });
    expect(gateway.refundPayment).toHaveBeenCalledTimes(3);
    expect(saveStripeRefundId).toHaveBeenCalledTimes(2);
    expect(saveStripeRefundId).not.toHaveBeenCalledWith("r-2", expect.anything());
    expect(console.error).toHaveBeenCalledWith(expect.any(String), "r-2", "insufficient funds");
    expect(loggedText()).not.toContain("pi_2");
  });

  it("stores nothing and counts a pending one when Stripe has no refund id (charge already refunded)", async () => {
    vi.mocked(listDispatchableRefunds).mockResolvedValue([refundOf(1)]);
    gateway.refundPayment.mockResolvedValue({ refundId: null });

    expect(await dispatchEventRefunds(EVENT_ID, gateway)).toEqual({ dispatched: 0, failed: 0, pending: 1 });
    expect(saveStripeRefundId).not.toHaveBeenCalled();
  });

  it("counts a failure to store the id as failed (a re-run reuses the same Stripe refund)", async () => {
    vi.mocked(listDispatchableRefunds).mockResolvedValue([refundOf(1)]);
    vi.mocked(saveStripeRefundId).mockRejectedValue(new Error("db down"));

    expect(await dispatchEventRefunds(EVENT_ID, gateway)).toEqual({ dispatched: 0, failed: 1, pending: 1 });
  });
});

describe("retryEventRefunds", () => {
  /** In-memory refunds: only those `pending` without a Stripe id are listed, `save` stores the id. */
  function statefulRefunds(initial: DispatchableRefund[]) {
    const rows = initial.map((row) => ({ ...row, stripeRefundId: null as string | null }));
    vi.mocked(listDispatchableRefunds).mockImplementation(async () =>
      rows.filter((row) => row.stripeRefundId === null).map(({ id, paymentIntentId }) => ({ id, paymentIntentId })),
    );
    vi.mocked(saveStripeRefundId).mockImplementation(async (id, stripeRefundId) => {
      const row = rows.find((candidate) => candidate.id === id);
      if (row) row.stripeRefundId = stripeRefundId;
    });
    return rows;
  }

  it("creates the missing refunds and tickets first, then dispatches", async () => {
    statefulRefunds([refundOf(1)]);

    expect(await retryEventRefunds(EVENT_ID, USER_ID, gateway)).toEqual({ dispatched: 1, failed: 0, pending: 0 });

    expect(ensureEventRefunds).toHaveBeenCalledWith(EVENT_ID, USER_ID);
    expect(refundEventTickets).toHaveBeenCalledWith(EVENT_ID);
    expect(vi.mocked(ensureEventRefunds).mock.invocationCallOrder[0]).toBeLessThan(
      gateway.refundPayment.mock.invocationCallOrder[0],
    );
  });

  it("after a partial failure only dispatches the one that is missing", async () => {
    statefulRefunds([refundOf(1), refundOf(2), refundOf(3)]);
    gateway.refundPayment.mockImplementation(async (paymentIntentId: string) => {
      if (paymentIntentId === "pi_2") throw new Error("temporary");
      return { refundId: `re_${paymentIntentId}` };
    });
    expect(await retryEventRefunds(EVENT_ID, USER_ID, gateway)).toEqual({ dispatched: 2, failed: 1, pending: 1 });

    gateway.refundPayment.mockClear();
    gateway.refundPayment.mockImplementation(async (paymentIntentId: string) => ({ refundId: `re_${paymentIntentId}` }));
    expect(await retryEventRefunds(EVENT_ID, USER_ID, gateway)).toEqual({ dispatched: 1, failed: 0, pending: 0 });

    expect(gateway.refundPayment).toHaveBeenCalledTimes(1);
    expect(gateway.refundPayment).toHaveBeenCalledWith("pi_2", "refund-row:r-2", { metadata: { refund_id: "r-2" } });
  });

  it("dispatches the new refund of a failed one under another key", async () => {
    const rows = statefulRefunds([]);
    // `ensureEventRefunds` creates a fresh row (r-9) for the payment whose refund failed or was cancelled.
    vi.mocked(ensureEventRefunds).mockImplementation(async () => {
      rows.push({ id: "r-9", paymentIntentId: "pi_1", stripeRefundId: null });
    });

    await retryEventRefunds(EVENT_ID, USER_ID, gateway);

    expect(gateway.refundPayment).toHaveBeenCalledTimes(1);
    expect(gateway.refundPayment).toHaveBeenCalledWith("pi_1", "refund-row:r-9", { metadata: { refund_id: "r-9" } });
  });

  it("reports nothing pending without calling Stripe", async () => {
    statefulRefunds([]);

    expect(await retryEventRefunds(EVENT_ID, USER_ID, gateway)).toEqual({ dispatched: 0, failed: 0, pending: 0 });
    expect(gateway.refundPayment).not.toHaveBeenCalled();
  });
});

describe("cancelEventAndRefund", () => {
  it("runs the batch once with the statement, event and author, then dispatches", async () => {
    vi.mocked(cancelEventBatch).mockResolvedValue(true);
    vi.mocked(listDispatchableRefunds).mockResolvedValue([refundOf(1)]);

    const result = await cancelEventAndRefund(cas, EVENT_ID, USER_ID, gateway);

    expect(result).toEqual({ ok: true, dispatch: { dispatched: 1, failed: 0, pending: 0 } });
    expect(cancelEventBatch).toHaveBeenCalledTimes(1);
    expect(cancelEventBatch).toHaveBeenCalledWith(cas, EVENT_ID, USER_ID);
  });

  it("propagates that the compare-and-set affected no row, without calling Stripe", async () => {
    vi.mocked(cancelEventBatch).mockResolvedValue(false);

    expect(await cancelEventAndRefund(cas, EVENT_ID, USER_ID, gateway)).toEqual({ ok: false });
    expect(listDispatchableRefunds).not.toHaveBeenCalled();
    expect(gateway.refundPayment).not.toHaveBeenCalled();
  });

  it("stays ok when Stripe fails for a refund", async () => {
    vi.mocked(cancelEventBatch).mockResolvedValue(true);
    vi.mocked(listDispatchableRefunds).mockResolvedValue([refundOf(1)]);
    gateway.refundPayment.mockRejectedValue(new Error("stripe down"));

    expect(await cancelEventAndRefund(cas, EVENT_ID, USER_ID, gateway)).toEqual({
      ok: true,
      dispatch: { dispatched: 0, failed: 1, pending: 1 },
    });
  });

  it("stays ok when the dispatch itself blows up after the batch committed", async () => {
    vi.mocked(cancelEventBatch).mockResolvedValue(true);
    vi.mocked(listDispatchableRefunds).mockRejectedValue(new Error("db down"));

    expect(await cancelEventAndRefund(cas, EVENT_ID, USER_ID, gateway)).toEqual({ ok: true, dispatch: null });
  });

  it("lets a failing batch propagate (nothing was cancelled)", async () => {
    vi.mocked(cancelEventBatch).mockRejectedValue(new Error("db down"));

    await expect(cancelEventAndRefund(cas, EVENT_ID, USER_ID, gateway)).rejects.toThrow("db down");
    expect(gateway.refundPayment).not.toHaveBeenCalled();
  });
});

describe("confirmRefund", () => {
  const webhookEvent = (
    status: string,
    overrides: Partial<RefundWebhookEvent["refund"]> = {},
    type = "refund.updated",
  ): RefundWebhookEvent => ({
    id: "evt_1",
    type,
    refund: { id: "re_1", status, metadataRefundId: "r-1", ...overrides },
  });
  const row = (overrides: Partial<WebhookRefundRow> = {}): WebhookRefundRow => ({
    id: "r-1",
    orderId: "order-1",
    status: "pending",
    stripeRefundId: "re_1",
    ...overrides,
  });

  beforeEach(() => {
    vi.mocked(findRefundForWebhook).mockResolvedValue(row());
  });

  it.each(["succeeded", "failed", "canceled"] as const)("finalizes a pending refund as %s in one batch", async (status) => {
    await confirmRefund(webhookEvent(status));

    expect(findRefundForWebhook).toHaveBeenCalledWith("re_1", "r-1");
    expect(finalizeRefundBatch).toHaveBeenCalledTimes(1);
    expect(finalizeRefundBatch).toHaveBeenCalledWith({
      stripeEvent: { id: "evt_1", type: "refund.updated" },
      refundId: "r-1",
      orderId: "order-1",
      stripeRefundId: "re_1",
      status,
    });
  });

  it("handles refund.created and refund.failed the same way (the status decides)", async () => {
    await confirmRefund(webhookEvent("succeeded", {}, "refund.created"));
    await confirmRefund(webhookEvent("failed", {}, "refund.failed"));

    expect(finalizeRefundBatch).toHaveBeenNthCalledWith(1, expect.objectContaining({ status: "succeeded" }));
    expect(finalizeRefundBatch).toHaveBeenNthCalledWith(2, expect.objectContaining({ status: "failed" }));
  });

  it.each(["pending", "requires_action", "something_new"])("changes nothing for %s", async (status) => {
    await confirmRefund(webhookEvent(status));

    expect(findRefundForWebhook).not.toHaveBeenCalled();
    expect(finalizeRefundBatch).not.toHaveBeenCalled();
  });

  it("finds a refund the webhook beat to storing its Stripe id by metadata and stores the id", async () => {
    vi.mocked(findRefundForWebhook).mockResolvedValue(row({ stripeRefundId: null }));

    await confirmRefund(webhookEvent("succeeded"));

    expect(findRefundForWebhook).toHaveBeenCalledWith("re_1", "r-1");
    expect(finalizeRefundBatch).toHaveBeenCalledWith(expect.objectContaining({ refundId: "r-1", stripeRefundId: "re_1" }));
  });

  it("answers an unknown refund with a warning and records the event", async () => {
    vi.mocked(findRefundForWebhook).mockResolvedValue(null);

    await confirmRefund(webhookEvent("succeeded"));

    expect(console.warn).toHaveBeenCalledWith(expect.any(String), "evt_1", "re_1");
    expect(markStripeEventProcessed).toHaveBeenCalledWith("evt_1", "refund.updated");
    expect(finalizeRefundBatch).not.toHaveBeenCalled();
  });

  it.each(["succeeded", "failed", "canceled"] as const)("never moves a refund that is already %s", async (status) => {
    vi.mocked(findRefundForWebhook).mockResolvedValue(row({ status }));

    await confirmRefund(webhookEvent("failed"));

    expect(finalizeRefundBatch).not.toHaveBeenCalled();
    expect(markStripeEventProcessed).toHaveBeenCalledWith("evt_1", "refund.updated");
  });

  it("lets a transient failure propagate so the webhook answers 500", async () => {
    vi.mocked(finalizeRefundBatch).mockRejectedValue({ code: "08006" });

    await expect(confirmRefund(webhookEvent("succeeded"))).rejects.toEqual({ code: "08006" });
    expect(hasProcessedStripeEvent).not.toHaveBeenCalled();
  });

  it("lets a failing lookup propagate", async () => {
    vi.mocked(findRefundForWebhook).mockRejectedValue(new Error("db down"));

    await expect(confirmRefund(webhookEvent("succeeded"))).rejects.toThrow("db down");
  });

  it("treats a 23505 from a twin delivery as done once the event is recorded", async () => {
    vi.mocked(finalizeRefundBatch).mockRejectedValue({ code: "23505" });
    vi.mocked(hasProcessedStripeEvent).mockResolvedValue(true);

    await expect(confirmRefund(webhookEvent("succeeded"))).resolves.toBeUndefined();
    expect(hasProcessedStripeEvent).toHaveBeenCalledWith("evt_1");
  });

  it("rethrows a 23505 when the event was not recorded (another unique clash)", async () => {
    vi.mocked(finalizeRefundBatch).mockRejectedValue({ code: "23505" });
    vi.mocked(hasProcessedStripeEvent).mockResolvedValue(false);

    await expect(confirmRefund(webhookEvent("succeeded"))).rejects.toEqual({ code: "23505" });
  });
});
