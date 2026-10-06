import { slugify } from "@/lib/utils";
import { getVenueMap } from "@/modules/booking/services/venue-service";
import { getCategories, getEventById, getUpcomingEvents } from "@/modules/event/services/event-service";

/**
 * Seed data derived from the app's mock data (event, venue and category
 * services). Pure: building it never touches the database.
 */
export interface SeedSeat {
  row: string;
  number: number;
  x: number;
  y: number;
}

export interface SeedVenueZone {
  key: string;
  name: string;
  seatingType: "numbered" | "general_admission";
  capacity: number | null;
  mapShape: { path: string; labelX: number; labelY: number };
  color: string;
  sortOrder: number;
  seats: SeedSeat[];
}

export interface SeedVenue {
  name: string;
  city: string;
  address: string;
  zones: SeedVenueZone[];
}

export interface SeedEventZone {
  zoneKey: string;
  name: string;
  priceCents: number;
  capacity: number | null;
}

export interface SeedEvent {
  slug: string;
  venueKey: string;
  categorySlug: string;
  title: string;
  description: string;
  coverImageUrl: string;
  coverAlt: string;
  startsAt: Date;
  doorsOpenAt: Date;
  minAge: number | null;
  featured: boolean;
  currency: string;
  zones: SeedEventZone[];
}

export interface SeedData {
  categories: { slug: string; label: string; icon: string }[];
  venues: Map<string, SeedVenue>;
  events: SeedEvent[];
}

/** Standing-zone capacities; the mock data has no capacity, only a sold-out status. */
const GA_CAPACITY: Record<string, number> = { vip: 300, general: 3000 };
const DEFAULT_GA_CAPACITY = 1000;

/** UTC offset of each mock city on its event dates (no DST change falls between them). */
const CITY_UTC_OFFSET: Record<string, string> = {
  Lima: "-05:00",
  Arequipa: "-05:00",
  Madrid: "+01:00",
  "Ciudad de México": "-06:00",
};

export const venueKey = (name: string, city: string) => `${name}|${city}`;

function localDate(date: string, time: string, city: string): Date {
  const offset = CITY_UTC_OFFSET[city];
  if (!offset) throw new Error(`No UTC offset configured for city "${city}"`);
  return new Date(`${date}T${time}:00${offset}`);
}

/** The mock dates are fixed; if one has passed, move it forward whole years so every seeded event is still upcoming. */
function nextOccurrence(date: Date, now: Date): Date {
  const next = new Date(date);
  while (next <= now) next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

export async function buildSeedData(now = new Date()): Promise<SeedData> {
  const categories = (await getCategories()).map(({ id, label, icon }) => ({ slug: id, label, icon }));
  const slugByLabel = new Map(categories.map((category) => [category.label, category.slug]));

  const venues = new Map<string, SeedVenue>();
  const events: SeedEvent[] = [];

  for (const { id } of await getUpcomingEvents()) {
    const [event, map] = await Promise.all([getEventById(id), getVenueMap(id)]);
    if (!event || !map) throw new Error(`Mock event ${id} has no detail or venue map`);

    const key = venueKey(event.venue, event.city);
    const zones = map.zones.map((zone, sortOrder) => {
      const seats = (zone.rows ?? []).flatMap((row) => row.seats);
      return { zone, seats, sortOrder, capacity: zone.kind === "general" ? (GA_CAPACITY[zone.id] ?? DEFAULT_GA_CAPACITY) : null };
    });

    // Every mock event shares the same stadium layout, so the first one defines the venue.
    if (!venues.has(key)) {
      venues.set(key, {
        name: event.venue,
        city: event.city,
        address: event.address,
        zones: zones.map(({ zone, seats, sortOrder, capacity }) => ({
          key: zone.id,
          name: zone.name,
          seatingType: zone.kind === "seated" ? "numbered" : "general_admission",
          capacity,
          mapShape: zone.shape,
          color: zone.color,
          sortOrder,
          seats: seats.map(({ row, number, x, y }) => ({ row, number, x, y })),
        })),
      });
    }

    const mockStart = localDate(event.date, event.startsAt, event.city);
    const startsAt = nextOccurrence(mockStart, now);
    const doorsOpenAt = new Date(startsAt.getTime() - (mockStart.getTime() - localDate(event.date, event.doorsOpenAt, event.city).getTime()));

    events.push({
      slug: slugify(event.title),
      venueKey: key,
      categorySlug: slugByLabel.get(event.category) ?? "",
      title: event.title,
      description: event.description,
      coverImageUrl: event.imageUrl,
      coverAlt: event.imageAlt,
      startsAt,
      doorsOpenAt,
      minAge: event.minAge,
      featured: event.featured,
      currency: event.currency,
      zones: zones.map(({ zone, capacity }) => ({
        zoneKey: zone.id,
        name: zone.name,
        priceCents: zone.price * 100,
        capacity,
      })),
    });
  }

  return { categories, venues, events };
}
