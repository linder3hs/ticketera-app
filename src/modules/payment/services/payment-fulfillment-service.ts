import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { eventSeat, eventZone, orderItem, orders, payment, reservation, reservationItem, ticket } from "@/db/schema";
import { stripeEventInsert } from "@/modules/payment/services/stripe-event-service";

/**
 * Data side of `payment_intent.succeeded` (see the stripe-payment-webhook
 * spec's "Batch de conversión"). `db` is neon-http: no interactive
 * transactions, so the conversion is one `db.batch` (a single non-interactive
 * READ COMMITTED transaction) whose guards abort it by raising a Postgres
 * error (`1 / 0` on a count mismatch → 22012); a guard that just affected 0
 * rows would not roll anything back. Each guarded set comes from an
 * `UPDATE … RETURNING`, never from a previous `SELECT`, so a twin delivery
 * waits on the row lock and re-checks the `WHERE` on the committed version.
 * `reservation`, `event_seat` and `event_zone` are never aliased (same lock
 * order as the reservation sweep); raw SQL sets `updated_at` by hand.
 */

export interface PaymentContext {
  paymentId: string;
  orderId: string;
  orderStatus: (typeof orders.$inferSelect)["status"];
  /** Internal event id (the order's), for the tickets. */
  eventId: string;
  buyerName: string;
  reservationId: string | null;
  reservationStatus: (typeof reservation.$inferSelect)["status"] | null;
  /** `order_item` ids of the order, ordered by id. */
  orderItemIds: string[];
}

/** payment ⨝ orders ⟕ reservation by PaymentIntent id, plus the order's item ids; null when no `payment` has it. */
export async function findPaymentContext(paymentIntentId: string): Promise<PaymentContext | null> {
  const [row] = await db
    .select({
      paymentId: payment.id,
      orderId: orders.id,
      orderStatus: orders.status,
      eventId: orders.eventId,
      buyerName: orders.buyerName,
      reservationId: orders.reservationId,
      reservationStatus: reservation.status,
    })
    .from(payment)
    .innerJoin(orders, eq(orders.id, payment.orderId))
    .leftJoin(reservation, eq(reservation.id, orders.reservationId))
    .where(eq(payment.stripePaymentIntentId, paymentIntentId))
    .limit(1);
  if (!row) return null;

  const items = await db
    .select({ id: orderItem.id })
    .from(orderItem)
    .where(eq(orderItem.orderId, row.orderId))
    .orderBy(asc(orderItem.id));

  return { ...row, orderItemIds: items.map((item) => item.id) };
}

export interface FulfillOrderInput {
  stripeEvent: { id: string; type: string };
  paymentId: string;
  orderId: string;
  reservationId: string;
  chargeId: string | null;
  /** One per `order_item` (≥ 1). `NewTicket[]` is assignable. */
  tickets: (typeof ticket.$inferInsert)[];
}

/** S2, primary guard (D6): the reservation is still `active`, whether or not `expires_at` has passed. */
function convertReservationStatement(reservationId: string) {
  return db.execute(sql`
    with converted as (
      update ${reservation} set status = 'converted', updated_at = now()
       where ${reservation.id} = ${reservationId}::uuid and ${reservation.status} = 'active'
      returning ${reservation.id}
    )
    select 1 / (count(*) = 1)::int as ok from converted
  `);
}

/** S3, always: every seat of the reservation goes `held → sold` (with no seats, `0 = 0`). */
function sellSeatsStatement(reservationId: string) {
  return db.execute(sql`
    with sold as (
      update ${eventSeat} set status = 'sold', updated_at = now()
       where ${eventSeat.id} in (select ${reservationItem.eventSeatId} from ${reservationItem}
                                  where ${reservationItem.reservationId} = ${reservationId}::uuid
                                    and ${reservationItem.eventSeatId} is not null)
         and ${eventSeat.status} = 'held'
      returning ${eventSeat.id}
    )
    select 1 / (count(*) = (select count(distinct ${reservationItem.eventSeatId}) from ${reservationItem}
                             where ${reservationItem.reservationId} = ${reservationId}::uuid
                               and ${reservationItem.eventSeatId} is not null))::int as ok
      from sold
  `);
}

/**
 * S4, always: per GA zone of the reservation, `sold_count += n` and
 * `held_count -= n` once (with no GA items, `0 = 0`). The sum does not change,
 * so the capacity CHECK (23514) is only the safety net.
 */
function sellGeneralAdmissionStatement(reservationId: string) {
  return db.execute(sql`
    with ga as (
      select ${reservationItem.eventZoneId} as event_zone_id, sum(${reservationItem.quantity})::int as quantity
        from ${reservationItem}
       where ${reservationItem.reservationId} = ${reservationId}::uuid and ${reservationItem.eventSeatId} is null
       group by ${reservationItem.eventZoneId}
    ),
    moved as (
      update ${eventZone}
         set sold_count = ${eventZone.soldCount} + ga.quantity,
             held_count = ${eventZone.heldCount} - ga.quantity,
             updated_at = now()
        from ga
       where ${eventZone.id} = ga.event_zone_id and ${eventZone.heldCount} >= ga.quantity
      returning ${eventZone.id}
    )
    select 1 / (count(*) = (select count(*) from ga))::int as ok from moved
  `);
}

/** S5: the order goes `pending → paid` exactly once (one conversion per order, whatever the event). */
function markOrderPaidStatement(orderId: string) {
  return db.execute(sql`
    with paid as (
      update ${orders} set status = 'paid', paid_at = now(), updated_at = now()
       where ${orders.id} = ${orderId}::uuid and ${orders.status} = 'pending'
      returning ${orders.id}
    )
    select 1 / (count(*) = 1)::int as ok from paid
  `);
}

/** S6: the payment goes `pending → succeeded` with its charge. */
function settlePaymentStatement(paymentId: string, chargeId: string | null) {
  return db.execute(sql`
    with settled as (
      update ${payment} set status = 'succeeded', stripe_charge_id = ${chargeId}, updated_at = now()
       where ${payment.id} = ${paymentId}::uuid and ${payment.status} = 'pending'
      returning ${payment.id}
    )
    select 1 / (count(*) = 1)::int as ok from settled
  `);
}

/** The conversion batch (S1–S7). Throws the Postgres error (22012/23514/23505) when a guard aborts; nothing is written. */
export async function fulfillOrder(input: FulfillOrderInput): Promise<void> {
  const { stripeEvent, paymentId, orderId, reservationId, chargeId, tickets } = input;
  if (tickets.length === 0) throw new Error("fulfillOrder needs at least one ticket.");

  await db.batch([
    // S1: no ON CONFLICT, so a twin delivery aborts with 23505 before taking inventory locks.
    stripeEventInsert(stripeEvent.id, stripeEvent.type),
    convertReservationStatement(reservationId),
    sellSeatsStatement(reservationId),
    sellGeneralAdmissionStatement(reservationId),
    markOrderPaidStatement(orderId),
    settlePaymentStatement(paymentId, chargeId),
    // S7: defense in depth (S5 already prevents a second entry); a `code` clash still raises 23505.
    db.insert(ticket).values(tickets).onConflictDoNothing({ target: ticket.orderItemId }),
  ]);
}

/** One batch: payment → succeeded + charge and order → cancelled, each only while `pending`. Idempotent. */
export async function cancelRefundedOrder(input: {
  paymentId: string;
  orderId: string;
  chargeId: string | null;
}): Promise<void> {
  const { paymentId, orderId, chargeId } = input;

  await db.batch([
    db
      .update(payment)
      .set({ status: "succeeded", stripeChargeId: chargeId })
      .where(and(eq(payment.id, paymentId), eq(payment.status, "pending"))),
    db
      .update(orders)
      .set({ status: "cancelled" })
      .where(and(eq(orders.id, orderId), eq(orders.status, "pending"))),
  ]);
}
