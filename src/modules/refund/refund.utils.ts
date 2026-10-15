import type { RefundActor, RefundEvent, TerminalRefundStatus } from "@/modules/refund/refund.types";
import { can } from "@/modules/user/user.permissions";

/** Per `refund` row (not per order: `refund:<orderId>` already belongs to the payments `settle` path). */
export function toRefundIdempotencyKey(refundId: string): string {
  return `refund-row:${refundId}`;
}

/**
 * Stripe `Refund.status` to the terminal state it sets, or `null` when nothing changes
 * (`pending`, `requires_action` and any value we don't know).
 */
export function mapStripeRefundStatus(status: string): TerminalRefundStatus | null {
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
    default:
      return null;
  }
}

/** Moderators, or the owner of the event with an approved organizer profile; only on a cancelled event. */
export function canRetryEventRefunds(actor: RefundActor, event: RefundEvent): boolean {
  if (event.status !== "cancelled") return false;
  if (can(actor.role, "event:moderate")) return true;
  return (
    actor.role === "organizer" &&
    actor.organizerId !== null &&
    actor.organizerId === event.organizerId &&
    actor.organizerStatus === "approved"
  );
}
