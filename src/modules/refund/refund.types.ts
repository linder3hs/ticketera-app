import type { eventStatus } from "@/db/schema/enums"; // types only: keeps drizzle out of the client bundle
import type { RefundStatus } from "@/modules/payment/payment.types";
import type { OrganizerStatus, Role } from "@/modules/user/user.types";

/** Where a refund can end: `pending` is the only state that still changes. */
export type TerminalRefundStatus = Extract<RefundStatus, "succeeded" | "failed" | "canceled">;

/** Whoever asks to retry the refunds of an event (`PolicyActor` is assignable). */
export interface RefundActor {
  role: Role;
  /** `organizer.id` of the actor, `null` when they have no organizer profile. */
  organizerId: string | null;
  organizerStatus: OrganizerStatus | null;
}

/** The slice of an event the retry policy decides on. */
export interface RefundEvent {
  organizerId: string;
  status: (typeof eventStatus.enumValues)[number];
}

/** A `pending` refund without a Stripe id yet, with the PaymentIntent to refund. */
export interface DispatchableRefund {
  id: string;
  paymentIntentId: string;
}

/** Outcome of sending the pending refunds of an event to Stripe. `pending` = `failed` + refunds Stripe returned no id for. */
export interface DispatchResult {
  dispatched: number;
  failed: number;
  pending: number;
}

/** Step A result: `ok: false` when the status change did not apply (sales changed or already cancelled). */
export type CancelEventResult = { ok: true; dispatch: DispatchResult | null } | { ok: false };

/** The refund row a webhook is about. */
export interface WebhookRefundRow {
  id: string;
  orderId: string;
  status: RefundStatus;
  stripeRefundId: string | null;
}

/** A verified `refund.*` event (a `PaymentWebhookEvent` whose `refund` is present). */
export interface RefundWebhookEvent {
  id: string;
  type: string;
  refund: { id: string; status: string; metadataRefundId: string | null };
}

export interface FinalizeRefundInput {
  stripeEvent: { id: string; type: string };
  refundId: string;
  orderId: string;
  stripeRefundId: string;
  status: TerminalRefundStatus;
}
