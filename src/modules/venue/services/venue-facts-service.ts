import { eq, inArray, sql, type SQL, type SQLWrapper } from "drizzle-orm";

import { db } from "@/db";
import { event, eventZone, venue, venueZone } from "@/db/schema";
import { eventHasSales } from "@/modules/event/services/event-facts-service";
import type { VenueFacts, ZoneFacts } from "@/modules/venue/venue.types";

/**
 * Facts the venue policy decides on (see the spec's "Definiciones"). The SQL
 * fragments are exported so the write service uses the very same definitions
 * as guards in its `WHERE` clauses.
 *
 * `eventHasSales` renders `venue_zone`, `event_zone` and `event_seat` without
 * alias: it only goes inside `venueHasSales`, whose subquery scope is `event`.
 * Venue ids are passed as bound values (never `venue_zone.venue_id`), so no
 * inner `venue_zone` can shadow them. Zone facts use `event_zone` only.
 */

/** Some event of the venue has sales (`eventHasSales`). `venueId` is a value or a column of the outer query. */
export function venueHasSales(venueId: SQLWrapper | string): SQL<boolean> {
  return sql<boolean>`exists (select 1 from ${event} where ${event.venueId} = ${venueId} and ${eventHasSales(event.id)})`;
}

/** Some event (any status) uses the venue: it cannot be deleted. */
export function venueIsReferenced(venueId: SQLWrapper | string): SQL<boolean> {
  return sql<boolean>`exists (select 1 from ${event} where ${event.venueId} = ${venueId})`;
}

/** Some `event_zone` uses the venue zone: it cannot be deleted, change type or regenerate seats. */
export function zoneIsReferenced(venueZoneId: SQLWrapper | string): SQL<boolean> {
  return sql<boolean>`exists (select 1 from ${eventZone} where ${eventZone.venueZoneId} = ${venueZoneId})`;
}

/** Largest `event_zone.capacity` among the event zones that use the venue zone (0 when none). */
export function zoneMinCapacity(venueZoneId: SQLWrapper | string): SQL<number> {
  return sql<number>`coalesce((select max(${eventZone.capacity}) from ${eventZone} where ${eventZone.venueZoneId} = ${venueZoneId}), 0)`;
}

/** `isReferenced`/`hasSales` for each venue, in one query. Every requested id has an entry (`false`/`false` for ids that do not exist). */
export async function getVenueFacts(venueIds: string[]): Promise<Map<string, VenueFacts>> {
  const facts = new Map<string, VenueFacts>(venueIds.map((id) => [id, { isReferenced: false, hasSales: false }]));
  if (venueIds.length === 0) return facts;

  const rows = await db
    .select({
      id: venue.id,
      // Wrapped in `sql` on purpose: a column at the top level of a single-table select loses its table name, which breaks the correlated subqueries.
      isReferenced: sql<boolean>`${venueIsReferenced(venue.id)}`.mapWith(Boolean),
      hasSales: sql<boolean>`${venueHasSales(venue.id)}`.mapWith(Boolean),
    })
    .from(venue)
    .where(inArray(venue.id, venueIds));

  for (const { id, isReferenced, hasSales } of rows) facts.set(id, { isReferenced, hasSales });
  return facts;
}

/** Facts of every zone of the venue, by zone id. Zones that do not exist have no entry. */
export async function getZoneFacts(venueId: string): Promise<Map<string, ZoneFacts>> {
  const rows = await db
    .select({
      id: venueZone.id,
      isReferenced: sql<boolean>`${zoneIsReferenced(venueZone.id)}`.mapWith(Boolean),
      minCapacity: sql<number>`${zoneMinCapacity(venueZone.id)}`.mapWith(Number),
    })
    .from(venueZone)
    .where(eq(venueZone.venueId, venueId));

  return new Map(rows.map(({ id, isReferenced, minCapacity }) => [id, { isReferenced, minCapacity }]));
}
