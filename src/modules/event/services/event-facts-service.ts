import { eq, inArray, sql, type SQL, type SQLWrapper } from "drizzle-orm";

import { db } from "@/db";
import { event, eventSeat, eventZone, orders, reservation, venueZone } from "@/db/schema";
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
