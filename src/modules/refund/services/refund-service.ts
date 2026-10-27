import type { BatchItem } from "drizzle-orm/batch";

import { pgErrorCode } from "@/lib/pg-error";
import {
  notifyEventCancelled,
  notifyRefundFinished,
  notifyRefundsPending,
} from "@/modules/email/services/notification-service";
import type { PaymentWebhookGateway } from "@/modules/payment/payment.types";
import { hasProcessedStripeEvent, markStripeEventProcessed } from "@/modules/payment/services/stripe-event-service";
import { stripePaymentGateway } from "@/modules/payment/services/stripe-payment-gateway";
import type { CancelEventResult, DispatchResult, RefundWebhookEvent } from "@/modules/refund/refund.types";
import { mapStripeRefundStatus, toRefundIdempotencyKey } from "@/modules/refund/refund.utils";
import {
  cancelEventBatch,
  ensureEventRefunds,
  findRefundForWebhook,
  finalizeRefundBatch,
  listDispatchableRefunds,
  refundEventTickets,
  saveStripeRefundId,
} from "@/modules/refund/services/refund-data-service";

/** The part of the payments gateway the refunds use. */
type RefundGateway = Pick<PaymentWebhookGateway, "refundPayment">;

/** Unique violation: a twin delivery already recorded the event. */
const UNIQUE_VIOLATION = "23505";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

/**
 * Step B (D3): asks Stripe, in series, for every `pending` refund of the event that has no Stripe id yet.
 * The key depends on the `refund` row, so a re-run gets the same Stripe refund back. One failure is logged
 * (ids only) and does not stop the rest. It never marks anything `succeeded`: that is the webhook's job.
 */
export async function dispatchEventRefunds(
  eventId: string,
  gateway: RefundGateway = stripePaymentGateway,
): Promise<DispatchResult> {
  const refunds = await listDispatchableRefunds(eventId);
  const result: DispatchResult = { dispatched: 0, failed: 0, pending: 0 };

  for (const refund of refunds) {
    try {
      const { refundId } = await gateway.refundPayment(refund.paymentIntentId, toRefundIdempotencyKey(refund.id), {
        metadata: { refund_id: refund.id },
      });
      if (refundId === null) {
        // `charge_already_refunded`: nothing to store; the refund stays pending for manual follow-up (spec question 4).
        console.warn("[refund] charge already refunded, no refund id", refund.id);
        result.pending += 1;
        continue;
      }
      await saveStripeRefundId(refund.id, refundId);
      result.dispatched += 1;
    } catch (error) {
      console.error("[refund] dispatch failed", refund.id, errorMessage(error));
      result.failed += 1;
      result.pending += 1;
    }
  }
  // Stripe rejections only (usually no balance on the connected account); `charge_already_refunded` needs no action from them.
  if (result.failed > 0) await notifyRefundsPending(eventId, result.failed);
  return result;
}

/**
 * Step A + B (D2-D3): runs the atomic batch (the caller's compare-and-set on the event, the refunds and
 * the tickets) and then sends the refunds to Stripe. `ok: false` when the compare-and-set did not apply.
 * Once the batch committed the cancellation is valid: a dispatch failure only shows in `dispatch` (or as `null`).
 */
export async function cancelEventAndRefund(
  casStatement: BatchItem<"pg">,
  eventId: string,
  requestedBy: string,
  gateway: RefundGateway = stripePaymentGateway,
): Promise<CancelEventResult> {
  if (!(await cancelEventBatch(casStatement, eventId, requestedBy))) return { ok: false };

  let dispatch: DispatchResult | null = null;
  try {
    dispatch = await dispatchEventRefunds(eventId, gateway);
  } catch (error) {
    console.error("[refund] dispatch failed", eventId, errorMessage(error));
  }
  await notifyEventCancelled(eventId);
  return { ok: true, dispatch };
}

/**
 * Retry (D4): creates the refunds still missing on a cancelled event (e.g. after a `failed` or `canceled`
 * one) and dispatches whatever is pending without a Stripe id. Who may retry is decided by the caller.
 */
export async function retryEventRefunds(
  eventId: string,
  requestedBy: string,
  gateway: RefundGateway = stripePaymentGateway,
): Promise<DispatchResult> {
  await ensureEventRefunds(eventId, requestedBy);
  await refundEventTickets(eventId);
  return dispatchEventRefunds(eventId, gateway);
}

/**
 * Webhook `refund.created|updated|failed` (D5): the Stripe status, not the event type, decides. The caller
 * has already checked `hasProcessedStripeEvent`. Throws on a transient failure (the webhook answers 500 and
 * Stripe retries); a twin delivery of the same event (23505) resolves to a no-op.
 */
export async function confirmRefund(event: RefundWebhookEvent): Promise<void> {
  const status = mapStripeRefundStatus(event.refund.status);
  if (!status) return; // pending, requires_action or unknown: nothing to record yet

  const row = await findRefundForWebhook(event.refund.id, event.refund.metadataRefundId);
  if (!row) {
    // E.g. the refund of the payments `settle` path, which never creates a `refund` row.
    console.warn("[refund] unknown refund", event.id, event.refund.id);
    await markStripeEventProcessed(event.id, event.type);
    return;
  }
  if (row.status !== "pending") {
    await markStripeEventProcessed(event.id, event.type); // terminal states never go back
    return;
  }

  try {
    await finalizeRefundBatch({
      stripeEvent: { id: event.id, type: event.type },
      refundId: row.id,
      orderId: row.orderId,
      stripeRefundId: event.refund.id,
      status,
    });
  } catch (error) {
    // A twin delivery recorded this event first: its batch already did the work.
    if (pgErrorCode(error) === UNIQUE_VIOLATION && (await hasProcessedStripeEvent(event.id))) return;
    throw error;
  }
  await notifyRefundFinished(row.orderId, row.id);
}
