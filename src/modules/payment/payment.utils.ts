import type { StripeOnboardingStatus } from "@/modules/user/user.types";
import type {
  ConfirmationOutcome,
  ConfirmationResult,
  PaymentIntentInput,
  PaymentIntentParams,
  PaymentIntentState,
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
    payment_method_types: ["card"],
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
