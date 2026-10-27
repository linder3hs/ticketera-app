import { pgErrorCode } from "@/lib/pg-error";
import {
  notifyOrderAutoRefunded,
  notifyOrderPaid,
  notifyPaymentFailed,
} from "@/modules/email/services/notification-service";
import {
  WebhookSignatureError,
  type PaymentWebhookEvent,
  type PaymentWebhookGateway,
  type SucceededPaymentRoute,
} from "@/modules/payment/payment.types";
import { isGuardAbort, PAYMENT_EVENT_TYPES, routeSucceededPayment } from "@/modules/payment/payment.utils";
import {
  cancelRefundedOrder,
  findPaymentContext,
  fulfillOrder,
  type PaymentContext,
} from "@/modules/payment/services/payment-fulfillment-service";
import {
  hasProcessedStripeEvent,
  markStripeEventProcessed,
} from "@/modules/payment/services/stripe-event-service";
import { stripePaymentGateway } from "@/modules/payment/services/stripe-payment-gateway";
import { toNewTickets } from "@/modules/payment/ticket.utils";
import { confirmRefund } from "@/modules/refund/services/refund-service";

export interface PaymentWebhookResult {
  status: 200 | 400 | 500;
}

/** A `payment_intent.succeeded` about a PaymentIntent. */
type SucceededPaymentEvent = PaymentWebhookEvent & { paymentIntentId: string };

/** The Stripe events that carry a refund; the refund's own status, not the event type, decides what changes. */
const REFUND_EVENT_TYPES: ReadonlySet<string> = new Set([
  PAYMENT_EVENT_TYPES.refundCreated,
  PAYMENT_EVENT_TYPES.refundUpdated,
  PAYMENT_EVENT_TYPES.refundFailed,
]);

/** Unique violation: a twin delivery already recorded the event, or a `ticket.code` clash. */
const UNIQUE_VIOLATION = "23505";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

/**
 * Verifies and handles a payments webhook: invalid signature -> 400, ignored or already handled
 * event -> 200, failure -> 500 (Stripe retries; nothing is recorded). `refund.*` events go to `confirmRefund`.
 */
export async function handlePaymentWebhook(
  payload: string,
  signature: string | null,
  gateway: PaymentWebhookGateway = stripePaymentGateway,
): Promise<PaymentWebhookResult> {
  if (!signature) return { status: 400 };

  try {
    const event = gateway.parseWebhook(payload, signature);
    if (event.type === PAYMENT_EVENT_TYPES.failed) {
      // Not terminal: the buyer retries on the same PaymentIntent, so the order stays `pending`.
      console.info("[stripe] payment failed", event.id, event.paymentIntentId);
      if (event.paymentIntentId) await notifyPaymentFailed(event.paymentIntentId);
      return { status: 200 };
    }
    if (REFUND_EVENT_TYPES.has(event.type)) {
      const { refund } = event;
      if (!refund) return { status: 200 };
      if (await hasProcessedStripeEvent(event.id)) return { status: 200 };

      await confirmRefund({ id: event.id, type: event.type, refund });
      return { status: 200 };
    }
    if (event.type !== PAYMENT_EVENT_TYPES.succeeded || !event.paymentIntentId) return { status: 200 };
    if (await hasProcessedStripeEvent(event.id)) return { status: 200 };

    await handleSucceededPayment({ ...event, paymentIntentId: event.paymentIntentId }, gateway);
    return { status: 200 };
  } catch (error) {
    if (error instanceof WebhookSignatureError) return { status: 400 };
    console.error("[stripe] payment webhook failed", errorMessage(error));
    return { status: 500 };
  }
}

async function handleSucceededPayment(event: SucceededPaymentEvent, gateway: PaymentWebhookGateway): Promise<void> {
  const context = await findPaymentContext(event.paymentIntentId);
  if (!context) {
    console.warn("[stripe] unknown PaymentIntent", event.id, event.paymentIntentId);
    await markStripeEventProcessed(event.id, event.type);
    return;
  }

  const route = routeSucceededPayment(context.orderStatus, context.reservationStatus);
  if (route !== "fulfill") return settle(route, event, context, gateway);

  try {
    // The event is recorded inside the conversion batch.
    await fulfill(event, context);
  } catch (error) {
    await recoverFromAbort(error, event, gateway);
  }
}

async function fulfill(event: SucceededPaymentEvent, context: PaymentContext): Promise<void> {
  const { reservationId } = context;
  // `fulfill` means an `active` reservation, so the order has one.
  if (!reservationId) throw new Error(`Order ${context.orderId} has no reservation to convert.`);

  await fulfillOrder({
    stripeEvent: { id: event.id, type: event.type },
    paymentId: context.paymentId,
    orderId: context.orderId,
    reservationId,
    chargeId: event.chargeId,
    tickets: toNewTickets(context.orderItemIds, context.eventId, context.buyerName),
  });
  await notifyOrderPaid(context.orderId);
}

/** D7: after a classified abort, reread once and re-route; anything else is rethrown (500). */
async function recoverFromAbort(
  error: unknown,
  event: SucceededPaymentEvent,
  gateway: PaymentWebhookGateway,
): Promise<void> {
  const guardAbort = isGuardAbort(error);
  if (!guardAbort && pgErrorCode(error) !== UNIQUE_VIOLATION) throw error;

  const context = await findPaymentContext(event.paymentIntentId);
  if (!context) throw error;

  const route = routeSucceededPayment(context.orderStatus, context.reservationStatus);
  if (route !== "fulfill") return settle(route, event, context, gateway);
  // Still pending + active after a unique violation: a `ticket.code` clash; the retry draws new codes.
  if (!guardAbort) throw error;

  // Still pending + active after a guard abort: the inventory no longer matches the reservation.
  console.error("[stripe] inventory mismatch, refunding", context.orderId, errorMessage(error));
  return settle("refund", event, context, gateway);
}

/** Records the event of an order that is not converted, refunding its charge first when it lost its hold. */
async function settle(
  route: Exclude<SucceededPaymentRoute, "fulfill">,
  event: SucceededPaymentEvent,
  context: PaymentContext,
  gateway: PaymentWebhookGateway,
): Promise<void> {
  if (route === "refund") {
    // Same key on every retry, so Stripe returns the same refund.
    const { refundId } = await gateway.refundPayment(event.paymentIntentId, `refund:${context.orderId}`);
    await cancelRefundedOrder({ paymentId: context.paymentId, orderId: context.orderId, chargeId: event.chargeId });
    console.warn("[stripe] charge refunded, order cancelled", context.orderId, refundId);
    await notifyOrderAutoRefunded(context.orderId);
  }
  await markStripeEventProcessed(event.id, event.type);
}
