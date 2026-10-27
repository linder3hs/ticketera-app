import { getAppUrl } from "@/lib/env";
import { findOrderById } from "@/modules/booking/services/order-service";
import { buildIcs, buildTicketsPdf, toFileName } from "@/modules/booking/ticket-export";
import {
  connectStatusEmail,
  eventCancelledEmail,
  eventPublishedEmail,
  impersonationEmail,
  orderAutoRefundedEmail,
  orderPaidEmail,
  organizerStatusEmail,
  paymentFailedEmail,
  refundFinishedEmail,
  refundsPendingEmail,
  roleChangedEmail,
  type EmailUser,
} from "@/modules/email/email-templates";
import type { EmailAttachment } from "@/modules/email/email.types";
import {
  findEventOrganizer,
  findOrderIdByPaymentIntent,
  listCancelledOrderIds,
} from "@/modules/email/services/email-data-service";
import { sendEmail, sendEmailBatch } from "@/modules/email/services/email-service";
import type { OrganizerStatus, Role, StripeOnboardingStatus } from "@/modules/user/user.types";

/**
 * Every `notify*` runs after the caller's write committed and NEVER throws: an email is best effort, so a
 * Resend or lookup failure is logged (ids only, no addresses) and the webhook or action carries on. Webhook
 * paths pass an idempotency key, so a Stripe retry doesn't email twice.
 */

/** A user an email goes to; `id` only shows up in logs. */
type Recipient = EmailUser & { id: string };

async function deliver(kind: string, ref: string, send: () => Promise<void>): Promise<void> {
  try {
    await send();
  } catch (error) {
    console.error("[email] not sent", kind, ref, error instanceof Error ? error.message : "unknown error");
  }
}

const toBase64 = (data: ArrayBuffer | string) =>
  (typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data)).toString("base64");

/** 1. Payment confirmed: the tickets as a PDF (QR included) plus the event for the calendar. */
export function notifyOrderPaid(orderId: string): Promise<void> {
  return deliver("order-paid", orderId, async () => {
    const order = await findOrderById(orderId);
    if (!order) return;

    const attachments: EmailAttachment[] = [];
    const pdf = await buildTicketsPdf(order.event, order);
    if (pdf) attachments.push({ filename: `entradas-${order.code}.pdf`, content: toBase64(pdf) });
    attachments.push({ filename: `${toFileName(order.event.title)}.ics`, content: toBase64(buildIcs(order.event, order)) });

    await sendEmail({ to: order.buyerEmail, ...orderPaidEmail(order, getAppUrl()), attachments }, `order-paid:${orderId}`);
  });
}

/** 2. Event cancelled: one email per order that is being refunded. */
export function notifyEventCancelled(eventId: string): Promise<void> {
  return deliver("event-cancelled", eventId, async () => {
    // ponytail: one lookup per order; a single joined query if events reach thousands of orders.
    const found = await Promise.all((await listCancelledOrderIds(eventId)).map(findOrderById));
    const appUrl = getAppUrl();
    const messages = found.flatMap((order) => (order ? [{ to: order.buyerEmail, ...eventCancelledEmail(order, appUrl) }] : []));
    if (messages.length > 0) await sendEmailBatch(messages, `event-cancelled:${eventId}`);
  });
}

/** 3. A refund reached a final state (succeeded, failed or canceled). */
// ponytail: the email reads the order's latest refund, which is this one while an order has one refund at a time;
// load the refund by `refundId` if partial refunds (`customer_request`) ever overlap on the same order.
export function notifyRefundFinished(orderId: string, refundId: string): Promise<void> {
  return deliver("refund-finished", refundId, async () => {
    const order = await findOrderById(orderId);
    const content = order && refundFinishedEmail(order, getAppUrl());
    if (order && content) await sendEmail({ to: order.buyerEmail, ...content }, `refund-finished:${refundId}`);
  });
}

/** 4. Charged after the hold expired: the charge was refunded and the order cancelled. */
export function notifyOrderAutoRefunded(orderId: string): Promise<void> {
  return deliver("order-auto-refunded", orderId, async () => {
    const order = await findOrderById(orderId);
    if (order) await sendEmail({ to: order.buyerEmail, ...orderAutoRefundedEmail(order, getAppUrl()) }, `order-auto-refunded:${orderId}`);
  });
}

/** 5. Organizer approved or suspended (`pending` is never emailed). */
export function notifyOrganizerStatus(user: Recipient, status: OrganizerStatus): Promise<void> {
  return deliver("organizer-status", user.id, async () => {
    if (status === "pending") return;
    await sendEmail({ to: user.email, ...organizerStatusEmail(user, status, getAppUrl()) });
  });
}

/** 6. A staff member changed the user's role. */
export function notifyRoleChanged(user: Recipient, role: Role): Promise<void> {
  return deliver("role-changed", user.id, () => sendEmail({ to: user.email, ...roleChangedEmail(user, role, getAppUrl()) }));
}

/** 7. Payouts turned on (`complete`) or Stripe asked for more data again (`pending`). */
export function notifyConnectStatus(
  accountId: string,
  user: EmailUser,
  status: Exclude<StripeOnboardingStatus, "not_started">,
): Promise<void> {
  return deliver("connect-status", accountId, () =>
    sendEmail({ to: user.email, ...connectStatusEmail(user, status, getAppUrl()) }, `connect-status:${accountId}:${status}`),
  );
}

/** 8. Some refunds of a cancelled event could not be sent to Stripe: the organizer's account is the usual cause. */
export function notifyRefundsPending(eventId: string, pending: number): Promise<void> {
  return deliver("refunds-pending", eventId, async () => {
    const event = await findEventOrganizer(eventId);
    if (event) await sendEmail({ to: event.email, ...refundsPendingEmail(event, pending, getAppUrl()) });
  });
}

/** 9. Someone other than the owner (the super admin) published the event. */
export function notifyEventPublished(eventId: string): Promise<void> {
  return deliver("event-published", eventId, async () => {
    const event = await findEventOrganizer(eventId);
    if (event) await sendEmail({ to: event.email, ...eventPublishedEmail(event, getAppUrl()) });
  });
}

/** 10. A card was declined; only while the order can still be paid. One per order a day (idempotency window). */
export function notifyPaymentFailed(paymentIntentId: string): Promise<void> {
  return deliver("payment-failed", paymentIntentId, async () => {
    const orderId = await findOrderIdByPaymentIntent(paymentIntentId);
    const order = orderId ? await findOrderById(orderId) : null;
    if (order?.status !== "pending") return;
    await sendEmail({ to: order.buyerEmail, ...paymentFailedEmail(order, getAppUrl()) }, `payment-failed:${order.id}`);
  });
}

/** 11. The super admin started impersonating the user. */
export function notifyImpersonationStarted(user: Recipient): Promise<void> {
  return deliver("impersonation", user.id, () => sendEmail({ to: user.email, ...impersonationEmail(user, new Date()) }));
}
