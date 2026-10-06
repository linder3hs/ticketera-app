/**
 * Seeds categories, venues and published events (from the mock data), each one
 * owned by a random organizer from the list below (existing organizers only):
 *
 *   npm run db:seed                              (default organizers)
 *   npm run db:seed -- a@correo.com b@correo.com (override)
 *
 * Idempotent: categories/venues/events that already exist are skipped.
 */
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  category,
  event,
  eventSeat,
  eventZone,
  organizer,
  user,
  venue,
  venueSeat,
  venueZone,
} from "@/db/schema";
import { buildSeedData, type SeedVenue } from "@/db/seed-data";

const DEFAULT_ORGANIZER_EMAILS = ["linderhassinger02@gmail.com", "linderhassingerwotdev@gmail.com"];

/** Rows per INSERT, to stay under Postgres' bind-parameter limit. */
const CHUNK = 1000;

async function insertInChunks<T>(rows: T[], insert: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await insert(rows.slice(i, i + CHUNK));
}

async function findOrganizerId(email: string): Promise<string> {
  const [row] = await db
    .select({ id: organizer.id })
    .from(user)
    .innerJoin(organizer, eq(organizer.userId, user.id))
    .where(eq(user.email, email));

  if (!row) throw new Error(`No organizer found for "${email}". Give that user the organizer role first.`);
  return row.id;
}

/** Venue + zones + seats, reusing what already exists. Returns zone ids by zone key and seat ids by "zoneKey:rowNumber". */
async function ensureVenue(seed: SeedVenue) {
  let [venueRow] = await db
    .select()
    .from(venue)
    .where(and(eq(venue.name, seed.name), eq(venue.city, seed.city)));

  if (!venueRow) {
    [venueRow] = await db
      .insert(venue)
      .values({ name: seed.name, city: seed.city, address: seed.address })
      .returning();

    await db.insert(venueZone).values(
      seed.zones.map((zone) => ({
        venueId: venueRow.id,
        name: zone.name,
        seatingType: zone.seatingType,
        capacity: zone.capacity,
        mapShape: zone.mapShape,
        color: zone.color,
        sortOrder: zone.sortOrder,
      })),
    );
  }

  const zoneRows = await db.select().from(venueZone).where(eq(venueZone.venueId, venueRow.id));
  const zoneIdByKey = new Map(seed.zones.map((zone) => [zone.key, zoneRows.find((row) => row.name === zone.name)!.id]));

  const numberedZones = seed.zones.filter((zone) => zone.seatingType === "numbered");
  const existingSeats = await db
    .select()
    .from(venueSeat)
    .where(inArray(venueSeat.venueZoneId, numberedZones.map((zone) => zoneIdByKey.get(zone.key)!)));

  if (existingSeats.length === 0) {
    await insertInChunks(
      numberedZones.flatMap((zone) =>
        zone.seats.map((seat) => ({
          venueZoneId: zoneIdByKey.get(zone.key)!,
          rowLabel: seat.row,
          seatNumber: seat.number,
          x: seat.x,
          y: seat.y,
        })),
      ),
      (chunk) => db.insert(venueSeat).values(chunk),
    );
  }

  const seats = await db
    .select()
    .from(venueSeat)
    .where(inArray(venueSeat.venueZoneId, numberedZones.map((zone) => zoneIdByKey.get(zone.key)!)));

  return { venueId: venueRow.id, zoneIdByKey, seats };
}

async function main() {
  const emails = process.argv.length > 2 ? process.argv.slice(2) : DEFAULT_ORGANIZER_EMAILS;
  const organizerIds = await Promise.all(emails.map((email) => findOrganizerId(email.toLowerCase())));
  const data = await buildSeedData();

  await db.insert(category).values(data.categories).onConflictDoNothing({ target: category.slug });
  const categories = await db.select().from(category);
  const categoryIdBySlug = new Map(categories.map((row) => [row.slug, row.id]));

  const venues = new Map<string, Awaited<ReturnType<typeof ensureVenue>>>();
  for (const [key, seed] of data.venues) venues.set(key, await ensureVenue(seed));

  let created = 0;
  for (const seed of data.events) {
    const venueIds = venues.get(seed.venueKey)!;

    const [eventRow] = await db
      .insert(event)
      .values({
        organizerId: organizerIds[Math.floor(Math.random() * organizerIds.length)],
        venueId: venueIds.venueId,
        categoryId: categoryIdBySlug.get(seed.categorySlug)!,
        title: seed.title,
        slug: seed.slug,
        description: seed.description,
        coverImageUrl: seed.coverImageUrl,
        coverAlt: seed.coverAlt,
        startsAt: seed.startsAt,
        doorsOpenAt: seed.doorsOpenAt,
        minAge: seed.minAge,
        status: "published",
        featured: seed.featured,
        currency: seed.currency,
      })
      .onConflictDoNothing({ target: event.slug })
      .returning();
    if (!eventRow) continue; // already seeded

    const zoneRows = await db
      .insert(eventZone)
      .values(
        seed.zones.map((zone) => ({
          eventId: eventRow.id,
          venueZoneId: venueIds.zoneIdByKey.get(zone.zoneKey)!,
          name: zone.name,
          priceCents: zone.priceCents,
          capacity: zone.capacity,
        })),
      )
      .returning();

    // `event_seat` rows are generated at publish time, only for numbered zones.
    const eventSeats = seed.zones.flatMap((zone) => {
      const eventZoneId = zoneRows.find((row) => row.venueZoneId === venueIds.zoneIdByKey.get(zone.zoneKey))!.id;
      const venueZoneId = venueIds.zoneIdByKey.get(zone.zoneKey)!;
      return venueIds.seats
        .filter((seat) => seat.venueZoneId === venueZoneId)
        .map((seat) => ({
          eventZoneId,
          venueSeatId: seat.id,
        }));
    });
    await insertInChunks(eventSeats, (chunk) => db.insert(eventSeat).values(chunk));

    created++;
    console.log(`+ ${seed.title}`);
  }

  console.log(`Done: ${created} new event(s), ${data.events.length - created} already existed.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
