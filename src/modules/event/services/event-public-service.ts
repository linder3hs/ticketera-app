import { and, eq, gt, inArray, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { cache } from "react";

import { db } from "@/db";
import { category, event, eventZone, venue, venueZone } from "@/db/schema";
import {
  FEATURED_LIMIT,
  RELATED_LIMIT,
  UPCOMING_LIMIT,
  isEventSlug,
  toPublicEventDetail,
  toPublicEvents,
  type PublicEventDetailRow,
  type PublicEventRow,
  type PublicZoneRow,
} from "@/modules/event/event-public.utils";
import type { Event, EventCategory, EventDetail } from "@/modules/event/event.types";
import { zoneCapacity, zoneOccupancy } from "@/modules/event/services/event-facts-service";

/**
 * Public reads for the landing and the event detail (no session): only events
 * visible in public, that is published and not started yet (see the spec's
 * "Definiciones").
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

/** Columns of a `PublicEventRow`, over `event` joined with its `venue` and `category`. */
const publicEventColumns = {
  id: event.id,
  slug: event.slug,
  title: event.title,
  coverImageUrl: event.coverImageUrl,
  coverAlt: event.coverAlt,
  startsAt: event.startsAt,
  featured: event.featured,
  currency: event.currency,
  category: category.label,
  venue: venue.name,
  city: venue.city,
};

/** Up to `limit` events matching `where`, soonest first. */
async function selectPublicEvents(where: SQL | undefined, limit: number): Promise<Event[]> {
  const rows: PublicEventRow[] = await db
    .select(publicEventColumns)
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

/** The detail of the event with `slug` visible in public at `now`; `undefined` for an invalid slug (without querying), unknown or not public. */
async function readPublicEventDetail(slug: string, now: Date): Promise<EventDetail | undefined> {
  if (!isEventSlug(slug)) return undefined;

  const [row]: PublicEventDetailRow[] = await db
    .select({
      ...publicEventColumns,
      description: event.description,
      doorsOpenAt: event.doorsOpenAt,
      minAge: event.minAge,
      address: venue.address,
    })
    .from(event)
    .innerJoin(venue, eq(venue.id, event.venueId))
    .innerJoin(category, eq(category.id, event.categoryId))
    .where(and(eq(event.slug, slug), isPublic(now)))
    .limit(1);
  if (!row) return undefined;

  return toPublicEventDetail(row, await selectPublicZones([row.id]));
}

/**
 * Public detail by URL slug (see `readPublicEventDetail`). Memoized per
 * request so `generateMetadata` and the page share one read: it takes only
 * `slug` and resolves `now` inside, because `cache` compares arguments by identity.
 */
export const getPublicEventDetail = cache(
  (slug: string): Promise<EventDetail | undefined> => readPublicEventDetail(slug, new Date()),
);

/** The event `listRelatedEvents` is related to, aliased to read its category in a subquery. */
const currentEvent = alias(event, "current_event");

/**
 * "También te puede interesar": up to `RELATED_LIMIT` events visible in public
 * of the same category as `eventId`, without it, soonest first.
 * Precondition: `eventId` is the internal id of an event `getPublicEventDetail`
 * already returned, so no URL parameter reaches here and there is no guard.
 */
export async function listRelatedEvents(eventId: string, now = new Date()): Promise<Event[]> {
  const sameCategory = db
    .select({ categoryId: currentEvent.categoryId })
    .from(currentEvent)
    .where(eq(currentEvent.id, eventId));

  return selectPublicEvents(
    and(isPublic(now), ne(event.id, eventId), eq(event.categoryId, sameCategory)),
    RELATED_LIMIT,
  );
}
