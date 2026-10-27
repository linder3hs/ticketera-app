import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { event, orders, organizer, payment, refund, user } from "@/db/schema";
import type { EventOrganizer } from "@/modules/email/email-templates";

/** The event with its organizer's user, or `null`. */
export async function findEventOrganizer(eventId: string): Promise<EventOrganizer | null> {
  const [row] = await db
    .select({ eventId: event.id, title: event.title, slug: event.slug, email: user.email, fullName: user.fullName })
    .from(event)
    .innerJoin(organizer, eq(organizer.id, event.organizerId))
    .innerJoin(user, eq(user.id, organizer.userId))
    .where(eq(event.id, eventId));
  return row ?? null;
}

/** Orders of the event that got a refund because it was cancelled (one per paid order). */
export async function listCancelledOrderIds(eventId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: orders.id })
    .from(orders)
    .innerJoin(refund, eq(refund.orderId, orders.id))
    .where(and(eq(orders.eventId, eventId), eq(refund.reason, "event_cancelled")));
  return rows.map((row) => row.id);
}

export async function findOrderIdByPaymentIntent(paymentIntentId: string): Promise<string | null> {
  const [row] = await db
    .select({ orderId: payment.orderId })
    .from(payment)
    .where(eq(payment.stripePaymentIntentId, paymentIntentId));
  return row?.orderId ?? null;
}
