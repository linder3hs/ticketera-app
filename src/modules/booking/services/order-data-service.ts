import { and, asc, eq, inArray, sql, type AnyColumn, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { category, event, eventSeat, eventZone, orderItem, orders, refund, ticket, venue, venueSeat } from "@/db/schema";
import type { RefundReason } from "@/modules/booking/order.types";
import type { OrderTicketRow } from "@/modules/booking/order.utils";
import type { RefundStatus } from "@/modules/payment/payment.types";

/** Orders that have tickets (or had them): the ones "Mis entradas" lists. */
const ORDERS_WITH_TICKETS = ["paid", "partially_refunded", "refunded"] as const;

/** A column of the order's most recent refund (correlated subquery); `null` when it has none. */
function lastRefund<T>(column: AnyColumn) {
  return sql<T | null>`(select ${column} from ${refund} where ${refund.orderId} = ${orders.id} order by ${refund.createdAt} desc, ${refund.id} desc limit 1)`;
}

/** Columns of an `OrderTicketRow` that come from the order, its event, venue and category, and its last refund. */
const orderColumns = {
  orderId: orders.id,
  orderCode: orders.code,
  orderStatus: orders.status,
  totalCents: orders.totalCents,
  buyerName: orders.buyerName,
  buyerEmail: orders.buyerEmail,
  eventId: event.id,
  eventSlug: event.slug,
  eventTitle: event.title,
  categoryLabel: category.label,
  coverImageUrl: event.coverImageUrl,
  coverAlt: event.coverAlt,
  startsAt: event.startsAt,
  currency: event.currency,
  venueName: venue.name,
  venueAddress: venue.address,
  venueCity: venue.city,
  refundStatus: lastRefund<RefundStatus>(refund.status),
  refundReason: lastRefund<RefundReason>(refund.reason),
  refundAmountCents: lastRefund<number>(refund.amountCents),
};

/**
 * One row per ticket of the orders that match `condition`, newest paid order first and each order's
 * tickets by zone and seat. User-facing callers always include `orders.user_id` in `condition`.
 */
function selectTicketRows(condition: SQL | undefined): Promise<OrderTicketRow[]> {
  return db
    .select({
      ...orderColumns,
      ticketId: ticket.id,
      ticketCode: ticket.code,
      ticketStatus: ticket.status,
      holderName: ticket.holderName,
      zoneName: eventZone.name,
      seatRow: venueSeat.rowLabel,
      seatNumber: venueSeat.seatNumber,
    })
    .from(ticket)
    .innerJoin(orderItem, eq(orderItem.id, ticket.orderItemId))
    .innerJoin(orders, eq(orders.id, orderItem.orderId))
    .innerJoin(event, eq(event.id, orders.eventId))
    .innerJoin(venue, eq(venue.id, event.venueId))
    .innerJoin(category, eq(category.id, event.categoryId))
    .innerJoin(eventZone, eq(eventZone.id, orderItem.eventZoneId))
    .leftJoin(eventSeat, eq(eventSeat.id, orderItem.eventSeatId))
    .leftJoin(venueSeat, eq(venueSeat.id, eventSeat.venueSeatId))
    .where(condition)
    .orderBy(
      sql`${orders.paidAt} desc nulls last`,
      asc(orders.id),
      asc(eventZone.name),
      asc(venueSeat.rowLabel),
      asc(venueSeat.seatNumber),
      asc(ticket.id),
    );
}

/** One row per ticket of the user's orders with tickets (`paid`, `partially_refunded`, `refunded`). */
export function listTicketRows(userId: string): Promise<OrderTicketRow[]> {
  return selectTicketRows(and(eq(orders.userId, userId), inArray(orders.status, [...ORDERS_WITH_TICKETS])));
}

/** One row per ticket of the user's order with that code, whatever its status; empty if it has none or isn't theirs. */
export function findTicketRows(userId: string, code: string): Promise<OrderTicketRow[]> {
  return selectTicketRows(and(eq(orders.userId, userId), eq(orders.code, code)));
}

/** The order matching `condition` on its own, with no ticket columns; `null` if none. */
async function selectOrderRow(condition: SQL): Promise<OrderTicketRow | null> {
  const [row] = await db
    .select(orderColumns)
    .from(orders)
    .innerJoin(event, eq(event.id, orders.eventId))
    .innerJoin(venue, eq(venue.id, event.venueId))
    .innerJoin(category, eq(category.id, event.categoryId))
    .where(condition)
    .limit(1);
  if (!row) return null;
  return { ...row, ticketId: null, ticketCode: null, ticketStatus: null, holderName: null, zoneName: null, seatRow: null, seatNumber: null };
}

/** The user's order with that code on its own (for one that has no tickets yet); `null` if it doesn't exist or isn't theirs. */
export function findOrderRow(userId: string, code: string): Promise<OrderTicketRow | null> {
  return selectOrderRow(and(eq(orders.userId, userId), eq(orders.code, code)) as SQL);
}

/**
 * Server-side only, NOT scoped to a user: one row per ticket of the order. For the buyer emails sent from
 * webhooks and staff actions, never for anything a request parameter can reach.
 */
export function findTicketRowsByOrderId(orderId: string): Promise<OrderTicketRow[]> {
  return selectTicketRows(eq(orders.id, orderId));
}

/** Server-side only, NOT scoped to a user (see `findTicketRowsByOrderId`): the order on its own. */
export function findOrderRowById(orderId: string): Promise<OrderTicketRow | null> {
  return selectOrderRow(eq(orders.id, orderId));
}
