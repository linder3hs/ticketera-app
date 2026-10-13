import { toLimaDate, toLimaTime } from "@/modules/event/event-list.utils";
import type { Event, EventDetail } from "@/modules/event/event.types";

/** "Últimas entradas" when what is left is at most this share of the capacity. */
export const LAST_TICKETS_RATIO = 0.1;

/** Events in the landing's Hero carousel. */
export const FEATURED_LIMIT = 5;

/** Events in the landing's "Próximos eventos" grid. */
export const UPCOMING_LIMIT = 8;

/** Events in the detail's "También te puede interesar". */
export const RELATED_LIMIT = 4;

/**
 * What `slugify` and `nextAvailableSlug` produce: `[a-z0-9]` words joined by
 * single `-`, none at the edges. No length cap (titles have none). Linear: every
 * repeated group starts with a mandatory `-`, so there is no catastrophic backtracking.
 */
export const EVENT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Whether `slug` can be an event slug; lets the detail skip the DB for impossible ones (e.g. `\u0000`, which Postgres rejects). */
export function isEventSlug(slug: string): boolean {
  return EVENT_SLUG_PATTERN.test(slug);
}

/** An event as the public read returns it, with its category label and venue. */
export interface PublicEventRow {
  id: string;
  slug: string;
  title: string;
  coverImageUrl: string | null;
  coverAlt: string | null;
  startsAt: Date;
  featured: boolean;
  currency: string;
  category: string;
  venue: string;
  city: string;
}

/** A public event row plus the fields only the detail page needs. */
export interface PublicEventDetailRow extends PublicEventRow {
  description: string | null;
  doorsOpenAt: Date | null;
  minAge: number | null;
  address: string;
}

/** One zone of a public event: GA and numbered zones alike, already resolved to capacity and occupancy. */
export interface PublicZoneRow {
  eventId: string;
  priceCents: number;
  capacity: number;
  occupied: number;
}

export interface ZoneSummary {
  minPriceCents: number;
  capacity: number;
  occupied: number;
}

/** Availability of an event from its total capacity and occupancy (see the spec's "Disponibilidad"). */
export function availabilityStatus(capacity: number, occupied: number): Event["status"] {
  const remaining = capacity - occupied;
  if (capacity <= 0 || remaining <= 0) return "sold-out";
  if (remaining <= capacity * LAST_TICKETS_RATIO) return "last-tickets";
  return "available";
}

/** Adds up zone rows per event: total capacity, total occupancy and the cheapest price. */
export function summarizeZones(zones: PublicZoneRow[]): Map<string, ZoneSummary> {
  const byEvent = new Map<string, ZoneSummary>();
  for (const zone of zones) {
    const total = byEvent.get(zone.eventId);
    if (total) {
      total.minPriceCents = Math.min(total.minPriceCents, zone.priceCents);
      total.capacity += zone.capacity;
      total.occupied += zone.occupied;
    } else {
      byEvent.set(zone.eventId, { minPriceCents: zone.priceCents, capacity: zone.capacity, occupied: zone.occupied });
    }
  }
  return byEvent;
}

/** Maps DB rows to the public `Event`, keeping the order of `events`. An event without zones is sold out from 0. */
export function toPublicEvents(events: PublicEventRow[], zones: PublicZoneRow[]): Event[] {
  const summaries = summarizeZones(zones);
  return events.map((row) => {
    const summary = summaries.get(row.id);
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      category: row.category,
      imageUrl: row.coverImageUrl ?? "",
      imageAlt: row.coverAlt ?? row.title,
      date: toLimaDate(row.startsAt),
      venue: row.venue,
      city: row.city,
      priceFrom: summary ? summary.minPriceCents / 100 : 0,
      currency: row.currency,
      status: summary ? availabilityStatus(summary.capacity, summary.occupied) : "sold-out",
      featured: row.featured,
    };
  });
}

/** Maps the detail row and its zones to `EventDetail`: the `Event` fields as in `toPublicEvents`, times as Lima's `HH:mm`. */
export function toPublicEventDetail(row: PublicEventDetailRow, zones: PublicZoneRow[]): EventDetail {
  const [base] = toPublicEvents([row], zones);
  return {
    ...base,
    description: row.description ?? "",
    startsAt: toLimaTime(row.startsAt),
    doorsOpenAt: row.doorsOpenAt ? toLimaTime(row.doorsOpenAt) : "",
    minAge: row.minAge,
    address: row.address,
  };
}
