import { eq, inArray, sql, type SQL, type SQLWrapper } from "drizzle-orm";

import { db } from "@/db";
import { event, eventSeat, eventZone, orders, reservation, reservationItem, venueZone } from "@/db/schema";
import type { EventFacts, ZoneState } from "@/modules/event/event-write.types";

/**
 * Sales facts the policy decides on (see the spec's "Definiciones"). The SQL
 * fragments are exported so the write service can use the very same
 * definitions as guards in its `WHERE` clauses.
 */

/** GA occupancy of an `event_zone` row: sold + held. */
export const gaOccupancy: SQL<number> = sql<number>`(${eventZone.soldCount} + ${eventZone.heldCount})`;

/** Numbered occupancy of an `event_zone` row: its seats sold or held. */
export const seatedOccupancy: SQL<number> = sql<number>`(select count(*) from ${eventSeat} where ${eventSeat.eventZoneId} = ${eventZone.id} and ${eventSeat.status} in ('sold', 'held'))`;

/** Occupancy of an `event_zone` row joined with its `venue_zone`. */
export const zoneOccupancy: SQL<number> = sql<number>`(case when ${venueZone.seatingType} = 'general_admission' then ${gaOccupancy} else ${seatedOccupancy} end)`;

/** Capacity of an `event_zone` row joined with its `venue_zone`: GA its capacity (0 when unset), numbered its seats. */
export const zoneCapacity: SQL<number> = sql<number>`(case when ${venueZone.seatingType} = 'general_admission' then coalesce(${eventZone.capacity}, 0) else (select count(*) from ${eventSeat} where ${eventSeat.eventZoneId} = ${eventZone.id}) end)`;

/*
 * Live reads (see the reservation-hold spec's "Definiciones"): what an expired
 * reservation, or the reader's own live one, holds counts as free. The public
 * reads and the venue map use them; the policy keeps the raw fragments above.
 *
 * `reservation`, `event_seat` and `event_zone` are never aliased in these
 * fragments or in the queries that embed them (Drizzle renders
 * `"reservation"."status"`); `reservation_item` goes as `ri`.
 */

/**
 * A `reservation` row the `readerId` reserving would free: active and either
 * expired or the reader's own. With `null` only the expired ones.
 */
export function releasableReservation(readerId: string | null): SQL<boolean> {
  const expired = sql`${reservation.expiresAt} <= now()`;
  const releasable = readerId === null ? expired : sql`(${expired} or ${reservation.userId} = ${readerId})`;
  return sql<boolean>`(${reservation.status} = 'active' and ${releasable})`;
}

/** Status of an `event_seat` row for `readerId`: `held` by a releasable reservation counts as `available`. */
export function effectiveSeatStatus(readerId: string | null): SQL<(typeof eventSeat.$inferSelect)["status"]> {
  return sql`(case when ${eventSeat.status} = 'held' and exists (select 1 from ${reservationItem} ri inner join ${reservation} on ${reservation.id} = ri.reservation_id where ri.event_seat_id = ${eventSeat.id} and ${releasableReservation(readerId)}) then 'available' else ${eventSeat.status} end)`;
}

/**
 * Live occupancy of an `event_zone` row joined with its `venue_zone`: the raw
 * one minus what reservations releasable for `readerId` hold.
 * - GA: their GA items' quantities.
 * - Numbered: their `held` seats, counted once each, so it equals counting the
 *   seats whose `effectiveSeatStatus` is `sold` or `held` (a seat item's
 *   `event_zone_id` is its seat's zone, as the hold guard enforces) without a
 *   lookup per seat across the whole public catalog.
 */
export function liveZoneOccupancy(readerId: string | null = null): SQL<number> {
  const releasable = releasableReservation(readerId);
  const releasedQuantity = sql`coalesce((select sum(ri.quantity) from ${reservationItem} ri inner join ${reservation} on ${reservation.id} = ri.reservation_id where ri.event_zone_id = ${eventZone.id} and ri.event_seat_id is null and ${releasable}), 0)`;
  const releasedSeats = sql`(select count(distinct ri.event_seat_id) from ${reservationItem} ri inner join ${reservation} on ${reservation.id} = ri.reservation_id inner join ${eventSeat} on ${eventSeat.id} = ri.event_seat_id where ri.event_zone_id = ${eventZone.id} and ri.event_seat_id is not null and ${eventSeat.status} = 'held' and ${releasable})`;
  return sql<number>`(case when ${venueZone.seatingType} = 'general_admission' then ${gaOccupancy} - ${releasedQuantity} else ${seatedOccupancy} - ${releasedSeats} end)`;
}

/** Any `orders` or `reservation` row references the event, whatever its status. */
export function eventHasOrders(eventId: SQLWrapper): SQL<boolean> {
  return sql<boolean>`(exists (select 1 from ${orders} where ${orders.eventId} = ${eventId}) or exists (select 1 from ${reservation} where ${reservation.eventId} = ${eventId}))`;
}

/** Some zone is occupied (sold or held) or there is an order that is neither failed nor cancelled. */
export function eventHasSales(eventId: SQLWrapper): SQL<boolean> {
  return sql<boolean>`(exists (select 1 from ${orders} where ${orders.eventId} = ${eventId} and ${orders.status} not in ('failed', 'cancelled')) or exists (select 1 from ${eventZone} inner join ${venueZone} on ${venueZone.id} = ${eventZone.venueZoneId} where ${eventZone.eventId} = ${eventId} and ${zoneOccupancy} > 0))`;
}

/** `hasSales`/`hasOrders` for each id, in one query. Every requested id has an entry (`false`/`false` for ids that do not exist). */
export async function getEventFacts(eventIds: string[]): Promise<Map<string, EventFacts>> {
  const facts = new Map<string, EventFacts>(eventIds.map((id) => [id, { hasSales: false, hasOrders: false }]));
  if (eventIds.length === 0) return facts;

  const rows = await db
    .select({
      id: event.id,
      // Wrapped in `sql` on purpose: a column at the top level of a single-table select loses its table name, which breaks the correlated subqueries.
      hasSales: sql<boolean>`${eventHasSales(event.id)}`.mapWith(Boolean),
      hasOrders: sql<boolean>`${eventHasOrders(event.id)}`.mapWith(Boolean),
    })
    .from(event)
    .where(inArray(event.id, eventIds));

  for (const { id, hasSales, hasOrders } of rows) facts.set(id, { hasSales, hasOrders });
  return facts;
}

type ZoneStateRow = ZoneState & { eventId: string };

/** One row per event zone with its occupancy; numbered zones have no capacity (it is their seats). */
async function selectZoneStates(where: SQL): Promise<ZoneStateRow[]> {
  const rows = await db
    .select({
      eventId: eventZone.eventId,
      venueZoneId: eventZone.venueZoneId,
      seatingType: venueZone.seatingType,
      priceCents: eventZone.priceCents,
      capacity: eventZone.capacity,
      occupied: sql<number>`${zoneOccupancy}`.mapWith(Number),
    })
    .from(eventZone)
    .innerJoin(venueZone, eq(venueZone.id, eventZone.venueZoneId))
    .where(where)
    .orderBy(venueZone.sortOrder, venueZone.name, eventZone.id);

  return rows.map((row) => ({ ...row, capacity: row.seatingType === "general_admission" ? row.capacity : null }));
}

const toZoneState = ({ venueZoneId, seatingType, priceCents, capacity, occupied }: ZoneStateRow): ZoneState => ({
  venueZoneId,
  seatingType,
  priceCents,
  capacity,
  occupied,
});

export async function getZoneStates(eventId: string): Promise<ZoneState[]> {
  const rows = await selectZoneStates(eq(eventZone.eventId, eventId));
  return rows.map(toZoneState);
}

/** Zone states of many events in one query (for the list). Every requested id has an entry (empty when it has no zones). */
export async function getZoneStatesByEvent(eventIds: string[]): Promise<Map<string, ZoneState[]>> {
  const byEvent = new Map<string, ZoneState[]>(eventIds.map((id) => [id, []]));
  if (eventIds.length === 0) return byEvent;

  for (const row of await selectZoneStates(inArray(eventZone.eventId, eventIds))) {
    byEvent.get(row.eventId)?.push(toZoneState(row));
  }
  return byEvent;
}
