import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHECKOUT_MESSAGES } from "@/modules/booking/checkout.utils";
import {
  createPendingOrder,
  findOrderByReservation,
  findPayoutAccount,
  updateBuyerSnapshot,
  type BuyerSnapshot,
  type StoredOrder,
} from "@/modules/booking/services/checkout-data-service";
import { startCheckout } from "@/modules/booking/services/checkout-service";
import { getLiveReservationForOrder } from "@/modules/booking/services/reservation-service";
import { preparePayment } from "@/modules/payment/services/payment-service";
import { getPlatformFeePercent } from "@/modules/payment/services/platform-fee-service";

vi.mock("@/modules/booking/services/checkout-data-service", () => ({
  findPayoutAccount: vi.fn(),
  findOrderByReservation: vi.fn(),
  createPendingOrder: vi.fn(),
  updateBuyerSnapshot: vi.fn(),
}));
vi.mock("@/modules/booking/services/reservation-service", () => ({ getLiveReservationForOrder: vi.fn() }));
vi.mock("@/modules/payment/services/platform-fee-service", () => ({ getPlatformFeePercent: vi.fn() }));
vi.mock("@/modules/payment/services/payment-service", () => ({ preparePayment: vi.fn() }));

const buyer: BuyerSnapshot = {
  fullName: "Ana Perez",
  email: "ana@example.com",
  documentType: "dni",
  documentNumber: "12345678",
  phone: "987654321",
};
const params = { userId: "user-1", eventId: "event-1", currency: "PEN", buyer };

// 2 GA tickets at 5000 + 1 seat at 8000 = 18000; 10 % fee = 1800.
const items = [
  { eventZoneId: "zone-ga", eventSeatId: null, quantity: 2, priceCents: 5000 },
  { eventZoneId: "zone-seat", eventSeatId: "seat-1", quantity: 1, priceCents: 8000 },
];
const amounts = { subtotalCents: 18000, platformFeeCents: 1800, totalCents: 18000 };
const createdOrder: StoredOrder = { id: "order-1", code: "TK-7H3KQ9XM", status: "pending", ...amounts };
const payment = { state: "requires_payment", clientSecret: "pi_secret" } as const;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getLiveReservationForOrder).mockResolvedValue({ id: "res-1", items });
  vi.mocked(findPayoutAccount).mockResolvedValue({ accountId: "acct_1", onboardingStatus: "complete" });
  vi.mocked(getPlatformFeePercent).mockResolvedValue(10);
  vi.mocked(findOrderByReservation).mockResolvedValue(null);
  vi.mocked(createPendingOrder).mockResolvedValue(createdOrder);
  vi.mocked(preparePayment).mockResolvedValue(payment);
});

describe("startCheckout", () => {
  it("creates the order with the amounts computed from the DB items and prepares the payment", async () => {
    const result = await startCheckout(params);

    expect(createPendingOrder).toHaveBeenCalledWith({
      userId: "user-1",
      eventId: "event-1",
      reservationId: "res-1",
      items,
      amounts,
      buyer,
    });
    expect(updateBuyerSnapshot).not.toHaveBeenCalled();
    expect(preparePayment).toHaveBeenCalledWith({
      orderId: "order-1",
      orderCode: "TK-7H3KQ9XM",
      reservationId: "res-1",
      eventId: "event-1",
      userId: "user-1",
      totalCents: 18000,
      platformFeeCents: 1800,
      currency: "PEN",
      destinationAccountId: "acct_1",
    });
    expect(result).toEqual({ ok: true, data: { orderCode: "TK-7H3KQ9XM", payment } });
  });

  it("retries a pending order: updates the snapshot, creates nothing and keeps the stored amounts", async () => {
    // Stored amounts differ from what the items would compute: a retry never reprices.
    const stored: StoredOrder = { ...createdOrder, subtotalCents: 9000, platformFeeCents: 900, totalCents: 9000 };
    vi.mocked(findOrderByReservation).mockResolvedValue(stored);

    const result = await startCheckout(params);

    expect(createPendingOrder).not.toHaveBeenCalled();
    expect(updateBuyerSnapshot).toHaveBeenCalledWith("order-1", buyer);
    expect(preparePayment).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: "order-1", totalCents: 9000, platformFeeCents: 900 }),
    );
    expect(result).toEqual({ ok: true, data: { orderCode: "TK-7H3KQ9XM", payment } });
  });

  it.each(["paid", "failed", "cancelled"] as const)("answers orderClosed for a %s order", async (status) => {
    vi.mocked(findOrderByReservation).mockResolvedValue({ ...createdOrder, status });

    expect(await startCheckout(params)).toEqual({ ok: false, error: CHECKOUT_MESSAGES.orderClosed });
    expect(updateBuyerSnapshot).not.toHaveBeenCalled();
    expect(preparePayment).not.toHaveBeenCalled();
  });

  it("answers reservationExpired without a live reservation and writes nothing", async () => {
    vi.mocked(getLiveReservationForOrder).mockResolvedValue(null);

    expect(await startCheckout(params)).toEqual({ ok: false, error: CHECKOUT_MESSAGES.reservationExpired });
    expect(createPendingOrder).not.toHaveBeenCalled();
    expect(preparePayment).not.toHaveBeenCalled();
  });

  it.each([
    ["no account", { accountId: null, onboardingStatus: "complete" as const }],
    ["onboarding pending", { accountId: "acct_1", onboardingStatus: "pending" as const }],
    ["onboarding not started", { accountId: "acct_1", onboardingStatus: "not_started" as const }],
    ["no event", null],
  ])("answers payoutsUnavailable (%s) and creates no order", async (_label, payout) => {
    vi.mocked(findPayoutAccount).mockResolvedValue(payout);

    expect(await startCheckout(params)).toEqual({ ok: false, error: CHECKOUT_MESSAGES.payoutsUnavailable });
    expect(createPendingOrder).not.toHaveBeenCalled();
    expect(preparePayment).not.toHaveBeenCalled();
  });

  it("answers nothingToPay when the subtotal is 0", async () => {
    vi.mocked(getLiveReservationForOrder).mockResolvedValue({
      id: "res-1",
      items: [{ eventZoneId: "zone-ga", eventSeatId: null, quantity: 2, priceCents: 0 }],
    });

    expect(await startCheckout(params)).toEqual({ ok: false, error: CHECKOUT_MESSAGES.nothingToPay });
    expect(createPendingOrder).not.toHaveBeenCalled();
    expect(preparePayment).not.toHaveBeenCalled();
  });

  it("propagates an invalid fee setting without creating an order", async () => {
    vi.mocked(getPlatformFeePercent).mockRejectedValue(new Error("invalid fee"));

    await expect(startCheckout(params)).rejects.toThrow("invalid fee");
    expect(createPendingOrder).not.toHaveBeenCalled();
    expect(preparePayment).not.toHaveBeenCalled();
  });

  it("re-reads the existing order when the insert loses the reservation's UNIQUE", async () => {
    const winner: StoredOrder = { ...createdOrder, id: "order-winner", code: "TK-WINNER01" };
    vi.mocked(findOrderByReservation).mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    vi.mocked(createPendingOrder).mockRejectedValue({ code: "23505" });

    const result = await startCheckout(params);

    expect(createPendingOrder).toHaveBeenCalledTimes(1);
    expect(updateBuyerSnapshot).toHaveBeenCalledWith("order-winner", buyer);
    expect(preparePayment).toHaveBeenCalledWith(expect.objectContaining({ orderId: "order-winner", orderCode: "TK-WINNER01" }));
    expect(result).toEqual({ ok: true, data: { orderCode: "TK-WINNER01", payment } });
  });

  it("propagates a unique violation that is not the reservation's (order code collision)", async () => {
    vi.mocked(createPendingOrder).mockRejectedValue({ code: "23505" });

    await expect(startCheckout(params)).rejects.toEqual({ code: "23505" });
    expect(preparePayment).not.toHaveBeenCalled();
  });

  it("propagates other database errors", async () => {
    vi.mocked(createPendingOrder).mockRejectedValue(new Error("connection lost"));

    await expect(startCheckout(params)).rejects.toThrow("connection lost");
    expect(findOrderByReservation).toHaveBeenCalledTimes(1);
  });

  it("propagates a payment provider error", async () => {
    vi.mocked(preparePayment).mockRejectedValue(new Error("stripe down"));

    await expect(startCheckout(params)).rejects.toThrow("stripe down");
  });
});
