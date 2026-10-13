import { describe, expect, it } from "vitest";

import type { PaymentIntentInput } from "@/modules/payment/payment.types";
import {
  CONNECT_EVENT_TYPES,
  PAYMENT_MESSAGES,
  amountToCents,
  calculatePlatformFeeCents,
  mapPaymentIntentStatus,
  mapTransfersStatus,
  resolveConfirmation,
  toPaymentIntentParams,
} from "@/modules/payment/payment.utils";

describe("mapTransfersStatus", () => {
  it("maps active to complete", () => {
    expect(mapTransfersStatus("active")).toBe("complete");
  });

  it.each(["pending", "restricted", "unsupported", "rejected"] as const)("maps %s to pending", (status) => {
    expect(mapTransfersStatus(status)).toBe("pending");
  });

  it("maps a missing status to pending", () => {
    expect(mapTransfersStatus(null)).toBe("pending");
    expect(mapTransfersStatus(undefined)).toBe("pending");
  });
});

describe("CONNECT_EVENT_TYPES", () => {
  it("lists the two thin account events", () => {
    expect(CONNECT_EVENT_TYPES).toEqual([
      "v2.core.account[configuration.recipient].capability_status_updated",
      "v2.core.account[requirements].updated",
    ]);
  });
});

describe("calculatePlatformFeeCents", () => {
  it("rounds to the nearest cent", () => {
    expect(calculatePlatformFeeCents(10000, 10)).toBe(1000);
    expect(calculatePlatformFeeCents(999, 10)).toBe(100);
    expect(calculatePlatformFeeCents(1005, 7.5)).toBe(75);
    expect(calculatePlatformFeeCents(1, 10)).toBe(0);
  });

  it("handles 0 % and 100 %", () => {
    expect(calculatePlatformFeeCents(5000, 0)).toBe(0);
    expect(calculatePlatformFeeCents(5000, 100)).toBe(5000);
  });

  it("is never negative nor above the subtotal", () => {
    expect(calculatePlatformFeeCents(5000, -10)).toBe(0);
    expect(calculatePlatformFeeCents(5000, 150)).toBe(5000);
    expect(calculatePlatformFeeCents(0, 10)).toBe(0);
  });
});

describe("mapPaymentIntentStatus", () => {
  it("maps final and in-flight states", () => {
    expect(mapPaymentIntentStatus("succeeded")).toBe("succeeded");
    expect(mapPaymentIntentStatus("processing")).toBe("processing");
    expect(mapPaymentIntentStatus("canceled")).toBe("closed");
  });

  it.each(["requires_payment_method", "requires_confirmation", "requires_action"])("maps %s to requires_payment", (status) => {
    expect(mapPaymentIntentStatus(status)).toBe("requires_payment");
  });
});

describe("toPaymentIntentParams", () => {
  const INPUT: PaymentIntentInput = {
    orderId: "order-1",
    orderCode: "TK-7H3KQ9XM",
    reservationId: "res-1",
    eventId: "event-1",
    userId: "user-1",
    totalCents: 12000,
    platformFeeCents: 1200,
    currency: "PEN",
    destinationAccountId: "acct_123",
  };

  it("builds a card-only destination charge with the fee", () => {
    expect(toPaymentIntentParams(INPUT)).toEqual({
      amount: 12000,
      currency: "pen",
      payment_method_types: ["card"],
      application_fee_amount: 1200,
      transfer_data: { destination: "acct_123" },
      metadata: {
        order_id: "order-1",
        order_code: "TK-7H3KQ9XM",
        reservation_id: "res-1",
        event_id: "event-1",
        user_id: "user-1",
      },
    });
  });

  it("only has string metadata values", () => {
    const { metadata } = toPaymentIntentParams(INPUT);
    expect(Object.values(metadata).every((value) => typeof value === "string")).toBe(true);
  });

  it("omits the application fee when it is 0", () => {
    expect(toPaymentIntentParams({ ...INPUT, platformFeeCents: 0 })).not.toHaveProperty("application_fee_amount");
  });
});

describe("amountToCents", () => {
  it("converts without floating-point error", () => {
    expect(amountToCents(59.97)).toBe(5997);
    expect(0.57 * 100).not.toBe(57);
    expect(amountToCents(0.57)).toBe(57);
    expect(amountToCents(1.15)).toBe(115);
  });

  it("handles zero and whole numbers", () => {
    expect(amountToCents(0)).toBe(0);
    expect(amountToCents(120)).toBe(12000);
  });
});

describe("resolveConfirmation", () => {
  it.each(["succeeded", "processing"])("is ok when the PaymentIntent is %s", (status) => {
    expect(resolveConfirmation({ paymentIntent: { status } })).toEqual({ ok: true });
  });

  it("shows the message of a card error", () => {
    expect(resolveConfirmation({ error: { type: "card_error", message: "Tu tarjeta fue rechazada." } })).toEqual({
      ok: false,
      error: "Tu tarjeta fue rechazada.",
    });
  });

  it("is generic for other errors", () => {
    const generic = { ok: false, error: PAYMENT_MESSAGES.generic };
    expect(resolveConfirmation({ error: { type: "api_error", message: "Internal details" } })).toEqual(generic);
    expect(resolveConfirmation({ error: { type: "card_error" } })).toEqual(generic);
    expect(resolveConfirmation({ error: {} })).toEqual(generic);
  });

  it("is generic for an unexpected state", () => {
    const generic = { ok: false, error: PAYMENT_MESSAGES.generic };
    expect(resolveConfirmation({ paymentIntent: { status: "requires_payment_method" } })).toEqual(generic);
    expect(resolveConfirmation({})).toEqual(generic);
  });
});
