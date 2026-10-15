import { pgErrorCode } from "@/lib/pg-error";
import type { StripeOnboardingStatus } from "@/modules/user/user.types";
import type {
  ConfirmationOutcome,
  ConfirmationResult,
  OrderStatus,
  PaymentIntentInput,
  PaymentIntentParams,
  PaymentIntentState,
  ReservationStatus,
  SucceededPaymentRoute,
  TransfersStatus,
} from "@/modules/payment/payment.types";

/** Account events that can change the onboarding status. Anything else is ignored. */
export const CONNECT_EVENT_TYPES: readonly string[] = [
  "v2.core.account[configuration.recipient].capability_status_updated",
  "v2.core.account[requirements].updated",
];

/** Only an `active` transfers capability completes onboarding; anything else (or missing) stays `pending`. */
export function mapTransfersStatus(status: TransfersStatus | null | undefined): StripeOnboardingStatus {
  return status === "active" ? "complete" : "pending";
}

export const PAYMENT_MESSAGES = {
  generic: "No pudimos procesar tu pago. Intenta de nuevo.",
} as const;

/** Platform fee of a subtotal at `percent` (10 = 10 %), rounded to a cent and kept between 0 and the subtotal. */
export function calculatePlatformFeeCents(subtotalCents: number, percent: number): number {
  const fee = Math.round((subtotalCents * percent) / 100);
  return Math.min(Math.max(fee, 0), Math.max(subtotalCents, 0));
}

/** Provider PaymentIntent status to the state the checkout acts on. */
export function mapPaymentIntentStatus(status: string): PaymentIntentState {
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "processing":
      return "processing";
    case "canceled":
      return "closed";
    default:
      // requires_payment_method, requires_confirmation, requires_action
      return "requires_payment";
  }
}

/** PaymentIntent params of an order: a card-only destination charge with the platform fee. */
export function toPaymentIntentParams(input: PaymentIntentInput): PaymentIntentParams {
  return {
    amount: input.totalCents,
    currency: input.currency.toLowerCase(),
    allowed_payment_method_types: ["card"],
    ...(input.platformFeeCents > 0 ? { application_fee_amount: input.platformFeeCents } : {}),
    transfer_data: { destination: input.destinationAccountId },
    metadata: {
      order_id: input.orderId,
      order_code: input.orderCode,
      reservation_id: input.reservationId,
      event_id: input.eventId,
      user_id: input.userId,
    },
  };
}

/** Amount in major units (e.g. soles) to minor units, without floating-point drift. */
export function amountToCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Decides the outcome of `confirmPayment`: only card errors show their message; anything unexpected is generic. */
export function resolveConfirmation(result: ConfirmationResult): ConfirmationOutcome {
  if (result.error) {
    const isCardError = result.error.type === "card_error" && Boolean(result.error.message);
    return { ok: false, error: isCardError ? (result.error.message as string) : PAYMENT_MESSAGES.generic };
  }
  const status = result.paymentIntent?.status;
  if (status === "succeeded" || status === "processing") return { ok: true };
  return { ok: false, error: PAYMENT_MESSAGES.generic };
}

/** Payments webhook events the app acts on. Anything else is ignored. */
export const PAYMENT_EVENT_TYPES = {
  succeeded: "payment_intent.succeeded",
  failed: "payment_intent.payment_failed",
  refundCreated: "refund.created",
  refundUpdated: "refund.updated",
  refundFailed: "refund.failed",
} as const;

/**
 * What a confirmed charge does to its order. Only a `pending` order with an `active` reservation
 * (even past `expires_at`) is converted; an order already paid just records the event; anything
 * else lost its hold or was closed, so the charge is refunded.
 */
export function routeSucceededPayment(
  orderStatus: OrderStatus,
  reservationStatus: ReservationStatus | null,
): SucceededPaymentRoute {
  switch (orderStatus) {
    case "paid":
    case "partially_refunded":
    case "refunded":
      return "alreadyPaid";
    case "pending":
      return reservationStatus === "active" ? "fulfill" : "refund";
    case "failed":
    case "cancelled":
      return "refund";
  }
}

/** SQLSTATEs of a tripped conversion guard: division by zero (count mismatch) and the capacity CHECK. */
const GUARD_ABORT_CODES: ReadonlySet<string> = new Set(["22012", "23514"]);

/** A conversion guard aborted the batch: 22012 (guard) or 23514 (capacity CHECK). */
export function isGuardAbort(error: unknown): boolean {
  const code = pgErrorCode(error);
  return code !== undefined && GUARD_ABORT_CODES.has(code);
}
