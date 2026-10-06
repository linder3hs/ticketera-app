import { and, eq, gt, inArray, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { category, event, eventZone, venue, venueZone } from "@/db/schema";
import {
  FEATURED_LIMIT,
  UPCOMING_LIMIT,
  toPublicEvents,
  type PublicEventRow,
  type PublicZoneRow,
} from "@/modules/event/event-public.utils";
import type { Event, EventCategory } from "@/modules/event/event.types";
import { zoneCapacity, zoneOccupancy } from "@/modules/event/services/event-facts-service";

/**
 * Public reads for the landing (no session): only events visible in public,
 * that is published and not started yet (see the spec's "Definiciones").
 */

/** Visible in public at `now`; covered by `event_status_starts_at_idx`. */
const isPublic = (now: Date): SQL | undefined => and(eq(event.status, "published"), gt(event.startsAt, now));

/** Price, capacity and occupancy of every zone of `eventIds`, in one query. */
async function selectPublicZones(eventIds: string[]): Promise<PublicZoneRow[]> {
  if (eventIds.length === 0) return [];

  return db
    .select({
      eventId: eventZone.eventId,
      priceCents: eventZone.priceCents,
      // Wrapped so `mapWith` does not set the decoder on the shared fragments.
      capacity: sql<number>`${zoneCapacity}`.mapWith(Number),
      occupied: sql<number>`${zoneOccupancy}`.mapWith(Number),
    })
    .from(eventZone)
    .innerJoin(venueZone, eq(venueZone.id, eventZone.venueZoneId))
    .where(inArray(eventZone.eventId, eventIds));
}

/** Up to `limit` events matching `where`, soonest first. */
async function selectPublicEvents(where: SQL | undefined, limit: number): Promise<Event[]> {
  const rows: PublicEventRow[] = await db
    .select({
      id: event.id,
      title: event.title,
      coverImageUrl: event.coverImageUrl,
      coverAlt: event.coverAlt,
      startsAt: event.startsAt,
      featured: event.featured,
      currency: event.currency,
      category: category.label,
      venue: venue.name,
      city: venue.city,
    })
    .from(event)
    .innerJoin(venue, eq(venue.id, event.venueId))
    .innerJoin(category, eq(category.id, event.categoryId))
    .where(where)
    .orderBy(event.startsAt, event.id)
    .limit(limit);

  return toPublicEvents(rows, await selectPublicZones(rows.map((row) => row.id)));
}

/** Every category by label; the public id is its slug (`?categoria=<slug>`). */
export async function listPublicCategories(): Promise<EventCategory[]> {
  const rows = await db
    .select({ id: category.slug, label: category.label, icon: category.icon })
    .from(category)
    .orderBy(category.label, category.slug);

  return rows.map((row) => ({ ...row, icon: row.icon ?? "" }));
}

/** The Hero carousel: featured events visible in public. */
export async function listFeaturedEvents(now = new Date()): Promise<Event[]> {
  return selectPublicEvents(and(isPublic(now), eq(event.featured, true)), FEATURED_LIMIT);
}

/** "Próximos eventos" (featured ones included), optionally of one category; an unknown slug yields none. */
export async function listUpcomingEvents(categorySlug?: string, now = new Date()): Promise<Event[]> {
  return selectPublicEvents(
    and(isPublic(now), categorySlug ? eq(category.slug, categorySlug) : undefined),
    UPCOMING_LIMIT,
  );
}
