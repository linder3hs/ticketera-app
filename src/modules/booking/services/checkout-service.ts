import { pgErrorCode } from "@/lib/pg-error";
import type { StartCheckoutResult } from "@/modules/booking/checkout.types";
import { CHECKOUT_MESSAGES, calculateOrderAmounts } from "@/modules/booking/checkout.utils";
import {
  type BuyerSnapshot,
  type StoredOrder,
  createPendingOrder,
  findOrderByReservation,
  findPayoutAccount,
  updateBuyerSnapshot,
} from "@/modules/booking/services/checkout-data-service";
import { getLiveReservationForOrder } from "@/modules/booking/services/reservation-service";
import { preparePayment } from "@/modules/payment/services/payment-service";
import { getPlatformFeePercent } from "@/modules/payment/services/platform-fee-service";

const UNIQUE_VIOLATION = "23505";

export interface StartCheckoutParams {
  userId: string;
  eventId: string;
  /** The event's currency (`PEN`). */
  currency: string;
  buyer: BuyerSnapshot;
}

const fail = (error: string): StartCheckoutResult => ({ ok: false, error });

/**
 * Starts (or resumes) the payment of the user's live reservation: creates its `pending` order once,
 * then prepares the PaymentIntent. Idempotent per reservation. Everything is read before anything is
 * written, so every rejection below leaves the DB untouched. Database, fee-setting and provider
 * errors propagate; the caller logs them and answers the generic message.
 */
export async function startCheckout({ userId, eventId, currency, buyer }: StartCheckoutParams): Promise<StartCheckoutResult> {
  const reservation = await getLiveReservationForOrder(userId, eventId);
  if (!reservation) return fail(CHECKOUT_MESSAGES.reservationExpired);

  const payout = await findPayoutAccount(eventId);
  if (!payout?.accountId || payout.onboardingStatus !== "complete") return fail(CHECKOUT_MESSAGES.payoutsUnavailable);

  const amounts = calculateOrderAmounts(reservation.items, await getPlatformFeePercent());
  if (amounts.totalCents <= 0) return fail(CHECKOUT_MESSAGES.nothingToPay);

  let order = await findOrderByReservation(reservation.id);
  let isNew = false;
  if (!order) {
    try {
      order = await createPendingOrder({
        userId,
        eventId,
        reservationId: reservation.id,
        items: reservation.items,
        amounts,
        buyer,
      });
      isNew = true;
    } catch (error) {
      if (pgErrorCode(error) !== UNIQUE_VIOLATION) throw error;
      // Another request created it first (the batch rolled back): continue with that order.
      order = await readConflictingOrder(reservation.id, error);
    }
  }
  if (order.status !== "pending") return fail(CHECKOUT_MESSAGES.orderClosed);

  // A retry may carry corrected buyer data; a new order already has this snapshot.
  if (!isNew) await updateBuyerSnapshot(order.id, buyer);

  const payment = await preparePayment({
    orderId: order.id,
    orderCode: order.code,
    reservationId: reservation.id,
    eventId,
    userId,
    // The stored amounts, not the recalculated ones: a retry never reprices.
    totalCents: order.totalCents,
    platformFeeCents: order.platformFeeCents,
    currency,
    destinationAccountId: payout.accountId,
  });
  return { ok: true, data: { orderCode: order.code, payment } };
}

async function readConflictingOrder(reservationId: string, cause: unknown): Promise<StoredOrder> {
  const existing = await findOrderByReservation(reservationId);
  // Not there: the conflict was the order `code` (rare), not the reservation.
  if (!existing) throw cause;
  return existing;
}
