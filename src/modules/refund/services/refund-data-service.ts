import type { BatchItem } from "drizzle-orm/batch";
import { and, asc, eq, exists, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { event, orders, payment, refund, ticket } from "@/db/schema";
import { stripeEventInsert } from "@/modules/payment/services/stripe-event-service";
import type { DispatchableRefund, FinalizeRefundInput, WebhookRefundRow } from "@/modules/refund/refund.types";

/**
 * Data side of the event refunds (see the event-cancellation-refunds spec, D2-D5).
 * `db` has no interactive transactions (`db.batch` is one transaction), so each step is a `db.batch`.
 * The guards here are not `1 / 0` aborts: a statement that affects 0 rows is the
 * intended idempotent no-op (a repeated cancel, a retry); only the `stripe_event`
 * primary key aborts a twin webhook delivery (23505).
 */

/** The event is already `cancelled` (inside the batch, after its compare-and-set). */
function eventIsCancelled(eventId: string) {
  return sql`exists (select 1 from ${event} where ${event.id} = ${eventId}::uuid and ${event.status} = 'cancelled')`;
}

/**
 * D2 step 2: one `pending` full refund per paid `payment` of the event, skipping any `payment` that
 * already has a `pending` or `succeeded` one (so a repeat or a retry never duplicates; a `failed` or
 * `canceled` refund gets a new row). Raw SQL: `created_at` and `updated_at` take their defaults.
 */
function ensureEventRefundsStatement(eventId: string, requestedBy: string) {
  return db.execute(sql`
    insert into ${refund} (payment_id, order_id, amount_cents, reason, status, requested_by)
    select ${payment.id}, ${payment.orderId}, ${payment.amountCents},
           'event_cancelled'::refund_reason, 'pending'::refund_status, ${requestedBy}::uuid
      from ${payment}
      join ${orders} on ${orders.id} = ${payment.orderId}
     where ${orders.eventId} = ${eventId}::uuid
       and ${orders.status} = 'paid'
       and ${payment.status} = 'succeeded'
       and ${eventIsCancelled(eventId)}
       and not exists (select 1 from ${refund}
                        where ${refund.paymentId} = ${payment.id} and ${refund.status} in ('pending', 'succeeded'))
  `);
}

/** D2 step 3: the event's valid tickets become `refunded` (a `used` one is never touched). */
function refundEventTicketsStatement(eventId: string) {
  return db
    .update(ticket)
    .set({ status: "refunded" })
    .where(and(eq(ticket.eventId, eventId), eq(ticket.status, "valid"), eventIsCancelled(eventId)));
}

/**
 * Step A (D2): the event's compare-and-set (built by the caller, not executed), the refunds and the
 * tickets in one atomic batch. `false` when the compare-and-set affected no row (the other two are then no-ops).
 */
export async function cancelEventBatch(
  casStatement: BatchItem<"pg">,
  eventId: string,
  requestedBy: string,
): Promise<boolean> {
  const results = (await db.batch([
    casStatement,
    ensureEventRefundsStatement(eventId, requestedBy),
    refundEventTicketsStatement(eventId),
  ])) as unknown[];
  return Array.isArray(results[0]) && results[0].length === 1;
}

/** Retry (D4): creates the missing `refund` rows of a cancelled event. A no-op when the event is not cancelled. */
export async function ensureEventRefunds(eventId: string, requestedBy: string): Promise<void> {
  await ensureEventRefundsStatement(eventId, requestedBy);
}

/** Retry (D4): the valid tickets of a cancelled event become `refunded`. */
export async function refundEventTickets(eventId: string): Promise<void> {
  await refundEventTicketsStatement(eventId);
}

/** Step B (D3): the event's `pending` refunds Stripe has not been asked about yet, oldest first. */
export async function listDispatchableRefunds(eventId: string): Promise<DispatchableRefund[]> {
  return db
    .select({ id: refund.id, paymentIntentId: payment.stripePaymentIntentId })
    .from(refund)
    .innerJoin(payment, eq(payment.id, refund.paymentId))
    .innerJoin(orders, eq(orders.id, refund.orderId))
    .where(
      and(
        eq(orders.eventId, eventId),
        eq(refund.reason, "event_cancelled"),
        eq(refund.status, "pending"),
        isNull(refund.stripeRefundId),
      ),
    )
    .orderBy(asc(refund.createdAt), asc(refund.id));
}

/** Stores the id Stripe returned; never overwrites one already there (the webhook may have set it first). */
export async function saveStripeRefundId(refundId: string, stripeRefundId: string): Promise<void> {
  await db
    .update(refund)
    .set({ stripeRefundId })
    .where(and(eq(refund.id, refundId), isNull(refund.stripeRefundId)));
}

const REFUND_ROW = {
  id: refund.id,
  orderId: refund.orderId,
  status: refund.status,
  stripeRefundId: refund.stripeRefundId,
};

/**
 * D5: the refund by its Stripe id or, while that is not stored yet (the webhook beat `saveStripeRefundId`),
 * by the `metadata.refund_id` we set. A metadata value that is not a uuid is ignored (it can be edited in the
 * dashboard, and casting it would make the query fail and Stripe retry forever).
 */
export async function findRefundForWebhook(
  stripeRefundId: string,
  metadataRefundId: string | null,
): Promise<WebhookRefundRow | null> {
  const [byStripeId] = await db.select(REFUND_ROW).from(refund).where(eq(refund.stripeRefundId, stripeRefundId));
  if (byStripeId) return byStripeId;

  if (!metadataRefundId || !z.uuid().safeParse(metadataRefundId).success) return null;
  const [byMetadata] = await db
    .select(REFUND_ROW)
    .from(refund)
    .where(and(eq(refund.id, metadataRefundId), isNull(refund.stripeRefundId)));
  return byMetadata ?? null;
}

/**
 * D5: records the event and moves a `pending` refund to its terminal state in one batch. Only `succeeded`
 * also marks the order `refunded` (and only if that refund really ended `succeeded`). A repeated event id
 * raises 23505 (the PK) and writes nothing.
 */
export async function finalizeRefundBatch(input: FinalizeRefundInput): Promise<void> {
  const { stripeEvent, refundId, orderId, stripeRefundId, status } = input;

  const statements: [BatchItem<"pg">, ...BatchItem<"pg">[]] = [
    stripeEventInsert(stripeEvent.id, stripeEvent.type),
    db
      .update(refund)
      .set({ status, stripeRefundId: sql`coalesce(${refund.stripeRefundId}, ${stripeRefundId})` })
      .where(and(eq(refund.id, refundId), eq(refund.status, "pending"))),
  ];
  if (status === "succeeded") {
    statements.push(
      db
        .update(orders)
        .set({ status: "refunded" })
        .where(
          and(
            eq(orders.id, orderId),
            inArray(orders.status, ["paid", "partially_refunded"]),
            exists(
              db
                .select({ one: sql`1` })
                .from(refund)
                .where(and(eq(refund.id, refundId), eq(refund.status, "succeeded"))),
            ),
          ),
        ),
    );
  }

  await db.batch(statements);
}
