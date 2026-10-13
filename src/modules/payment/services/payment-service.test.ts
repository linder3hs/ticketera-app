import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PaymentGateway } from "@/modules/payment/payment.types";
import { findPaymentByOrderId, insertPayment } from "@/modules/payment/services/payment-record-service";
import { preparePayment, type PreparePaymentInput } from "@/modules/payment/services/payment-service";

vi.mock("@/modules/payment/services/payment-record-service", () => ({
  findPaymentByOrderId: vi.fn(),
  insertPayment: vi.fn(),
}));
// The real gateway pulls in the Stripe SDK; tests inject a fake instead.
vi.mock("@/modules/payment/services/stripe-payment-gateway", () => ({ stripePaymentGateway: {} }));

const input: PreparePaymentInput = {
  orderId: "order-1",
  orderCode: "TK-7H3KQ9XM",
  reservationId: "res-1",
  eventId: "event-1",
  userId: "user-1",
  totalCents: 15000,
  platformFeeCents: 1500,
  currency: "PEN",
  destinationAccountId: "acct_123",
};

const record = { id: "pay-1", orderId: "order-1", stripePaymentIntentId: "pi_1" };

const gateway = {
  createPaymentIntent: vi.fn(),
  retrievePaymentIntent: vi.fn(),
} satisfies PaymentGateway;

beforeEach(() => {
  vi.resetAllMocks();
  gateway.createPaymentIntent.mockResolvedValue({ id: "pi_1", clientSecret: "pi_1_secret", status: "requires_payment_method" });
  vi.mocked(findPaymentByOrderId).mockResolvedValue(null);
  vi.mocked(insertPayment).mockResolvedValue(record);
});

describe("preparePayment", () => {
  it("creates the PaymentIntent, stores a pending payment and returns the client secret", async () => {
    const result = await preparePayment(input, gateway);

    expect(result).toEqual({ state: "requires_payment", clientSecret: "pi_1_secret" });
    expect(gateway.createPaymentIntent).toHaveBeenCalledTimes(1);
    expect(gateway.createPaymentIntent).toHaveBeenCalledWith(
      {
        amount: 15000,
        currency: "pen",
        payment_method_types: ["card"],
        application_fee_amount: 1500,
        transfer_data: { destination: "acct_123" },
        metadata: {
          order_id: "order-1",
          order_code: "TK-7H3KQ9XM",
          reservation_id: "res-1",
          event_id: "event-1",
          user_id: "user-1",
        },
      },
      "payment-intent:order-1",
    );
    expect(insertPayment).toHaveBeenCalledWith({
      orderId: "order-1",
      stripePaymentIntentId: "pi_1",
      amountCents: 15000,
      applicationFeeCents: 1500,
      destinationAccountId: "acct_123",
    });
  });

  it.each([
    ["requires_payment_method", { state: "requires_payment", clientSecret: "pi_1_secret" }],
    ["requires_action", { state: "requires_payment", clientSecret: "pi_1_secret" }],
    ["processing", { state: "processing" }],
    ["succeeded", { state: "succeeded" }],
  ])("with a stored payment it does not create anything and maps %s", async (status, expected) => {
    vi.mocked(findPaymentByOrderId).mockResolvedValue(record);
    gateway.retrievePaymentIntent.mockResolvedValue({ id: "pi_1", clientSecret: "pi_1_secret", status });

    const result = await preparePayment(input, gateway);

    expect(result).toEqual(expected);
    expect(gateway.retrievePaymentIntent).toHaveBeenCalledWith("pi_1");
    expect(gateway.createPaymentIntent).not.toHaveBeenCalled();
    expect(insertPayment).not.toHaveBeenCalled();
  });

  it("throws when the PaymentIntent was canceled", async () => {
    vi.mocked(findPaymentByOrderId).mockResolvedValue(record);
    gateway.retrievePaymentIntent.mockResolvedValue({ id: "pi_1", clientSecret: "pi_1_secret", status: "canceled" });

    await expect(preparePayment(input, gateway)).rejects.toThrow();
  });

  it("rereads the payment when a concurrent request stored it first", async () => {
    vi.mocked(insertPayment).mockResolvedValue(null);
    vi.mocked(findPaymentByOrderId).mockResolvedValueOnce(null).mockResolvedValueOnce(record);

    const result = await preparePayment(input, gateway);

    expect(result).toEqual({ state: "requires_payment", clientSecret: "pi_1_secret" });
    expect(findPaymentByOrderId).toHaveBeenCalledTimes(2);
    expect(gateway.retrievePaymentIntent).not.toHaveBeenCalled();
  });

  it("uses the stored PaymentIntent when the concurrent request stored a different one", async () => {
    vi.mocked(insertPayment).mockResolvedValue(null);
    vi.mocked(findPaymentByOrderId)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...record, stripePaymentIntentId: "pi_other" });
    gateway.retrievePaymentIntent.mockResolvedValue({ id: "pi_other", clientSecret: "pi_other_secret", status: "requires_payment_method" });

    const result = await preparePayment(input, gateway);

    expect(result).toEqual({ state: "requires_payment", clientSecret: "pi_other_secret" });
    expect(gateway.retrievePaymentIntent).toHaveBeenCalledWith("pi_other");
  });

  it("propagates a gateway error and stores nothing", async () => {
    gateway.createPaymentIntent.mockRejectedValue(new Error("stripe down"));

    await expect(preparePayment(input, gateway)).rejects.toThrow("stripe down");
    expect(insertPayment).not.toHaveBeenCalled();
  });
});
