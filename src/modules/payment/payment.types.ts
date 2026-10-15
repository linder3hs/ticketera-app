import type { orderStatus, refundStatus, reservationStatus } from "@/db/schema/enums"; // types only: keeps drizzle out of the client bundle

export type OrderStatus = (typeof orderStatus.enumValues)[number];
export type RefundStatus = (typeof refundStatus.enumValues)[number];
export type ReservationStatus = (typeof reservationStatus.enumValues)[number];

/** Status of the `stripe_transfers` capability of a connected account (Accounts v2). */
export type TransfersStatus = "active" | "pending" | "restricted" | "unsupported" | "rejected";

/** What the app needs from a verified Connect webhook notification. */
export interface ConnectWebhookEvent {
  id: string;
  type: string;
  /** The connected account the event is about, if the event carries one. */
  accountId: string | null;
}

/** Result of starting (or resuming) the payments onboarding: the hosted URL to redirect to. */
export type ConnectLinkResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Raised by `ConnectGateway.parseWebhook` and `PaymentWebhookGateway.parseWebhook` when the payload
 * or signature can't be verified.
 */
export class WebhookSignatureError extends Error {
  constructor(message = "Invalid webhook signature.") {
    super(message);
    this.name = "WebhookSignatureError";
  }
}

/** Narrow port to the payments provider: the rest of the app never sees the provider's SDK. */
export interface ConnectGateway {
  /** Creates a connected account; `idempotencyKey` makes concurrent retries return the same account. */
  createAccount(input: {
    businessName: string;
    contactEmail: string;
    organizerId: string;
    idempotencyKey: string;
  }): Promise<{ accountId: string }>;
  /** A fresh, single-use hosted onboarding link. */
  createOnboardingLink(accountId: string): Promise<{ url: string }>;
  /** Current `stripe_transfers` status, or `null` when the account doesn't report one. */
  getTransfersStatus(accountId: string): Promise<TransfersStatus | null>;
  /** Verifies the signature and parses the notification. Throws `WebhookSignatureError` when invalid. */
  parseWebhook(payload: string, signature: string): ConnectWebhookEvent;
}

/** Where a PaymentIntent stands, as the checkout cares about it. `closed` = canceled, can't be paid. */
export type PaymentIntentState = "requires_payment" | "processing" | "succeeded" | "closed";

/** What the client needs to continue: confirm with the `clientSecret`, or go on if it's already paid. */
export type PreparedPayment =
  | { state: "requires_payment"; clientSecret: string }
  | { state: "processing" | "succeeded" };

/** A destination charge with the platform fee, card only. */
export interface PaymentIntentParams {
  /** Minor units. */
  amount: number;
  /** Lowercase. */
  currency: string;
  allowed_payment_method_types: ["card"];
  /** Only present when > 0. */
  application_fee_amount?: number;
  transfer_data: { destination: string };
  metadata: Record<string, string>;
}

/** What identifies and prices the charge of one order. */
export interface PaymentIntentInput {
  orderId: string;
  orderCode: string;
  reservationId: string;
  eventId: string;
  userId: string;
  totalCents: number;
  platformFeeCents: number;
  currency: string;
  destinationAccountId: string;
}

/** The part of a PaymentIntent the app uses. `status` is the provider's raw status. */
export interface PaymentIntentSnapshot {
  id: string;
  clientSecret: string;
  status: string;
}

/** The part of the client-side `confirmPayment` result that `resolveConfirmation` reads. */
export interface ConfirmationResult {
  error?: { type?: string; message?: string };
  paymentIntent?: { status: string };
}

/** Result of paying in the browser: ok = the PaymentIntent is `succeeded` or `processing`. */
export type ConfirmationOutcome = { ok: true } | { ok: false; error: string };

/** Narrow port to the payments provider for charges: the rest of the app never sees the provider's SDK. */
export interface PaymentGateway {
  /** Creates a PaymentIntent; the same `idempotencyKey` returns the same one. */
  createPaymentIntent(params: PaymentIntentParams, idempotencyKey: string): Promise<PaymentIntentSnapshot>;
  retrievePaymentIntent(id: string): Promise<PaymentIntentSnapshot>;
}

/** What the app needs from a verified payments (v1 snapshot) webhook event. */
export interface PaymentWebhookEvent {
  id: string;
  type: string;
  /** The PaymentIntent the event is about; null when the object is not a PaymentIntent. */
  paymentIntentId: string | null;
  /** Id of the PaymentIntent's `latest_charge`; null when it has none. */
  chargeId: string | null;
  /** Present when the event's object is a refund; `status` is the provider's raw refund status. */
  refund?: { id: string; status: string; metadataRefundId: string | null };
}

/** Narrow port for the payments webhook (ISP: the checkout keeps using `PaymentGateway`). */
export interface PaymentWebhookGateway {
  /** Verifies with the payments webhook secret; throws `WebhookSignatureError` when invalid, `Error` when the secret is missing. */
  parseWebhook(payload: string, signature: string): PaymentWebhookEvent;
  /**
   * Full refund reversing the transfer and the platform fee; same key → same refund; `null` id when already refunded.
   * `options.metadata` is attached to the provider's refund.
   */
  refundPayment(
    paymentIntentId: string,
    idempotencyKey: string,
    options?: { metadata?: Record<string, string> },
  ): Promise<{ refundId: string | null }>;
}

/** What a `payment_intent.succeeded` does to its order: convert it, just record the event, or refund the charge. */
export type SucceededPaymentRoute = "fulfill" | "alreadyPaid" | "refund";
