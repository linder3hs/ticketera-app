import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { eventSeatStatus, eventStatus } from "./enums";
import { organizer } from "./identity";
import { venue, venueSeat, venueZone } from "./venue";

export const category = pgTable("category", {
  id,
  slug: text("slug").notNull().unique(),
  label: text("label").notNull(),
  icon: text("icon"),
  ...timestamps,
});

export const event = pgTable(
  "event",
  {
    id,
    organizerId: uuid("organizer_id")
      .notNull()
      .references(() => organizer.id),
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venue.id),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => category.id),
    title: text("title").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    coverImageUrl: text("cover_image_url"),
    coverAlt: text("cover_alt"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    doorsOpenAt: timestamp("doors_open_at", { withTimezone: true }),
    minAge: integer("min_age"),
    status: eventStatus("status").notNull().default("draft"),
    featured: boolean("featured").notNull().default(false),
    currency: text("currency").notNull().default("PEN"),
    ...timestamps,
  },
  (t) => [
    index("event_status_starts_at_idx").on(t.status, t.startsAt),
    index("event_category_id_idx").on(t.categoryId),
    index("event_organizer_id_idx").on(t.organizerId),
    index("event_venue_id_idx").on(t.venueId),
  ],
);

export const eventZone = pgTable(
  "event_zone",
  {
    id,
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    venueZoneId: uuid("venue_zone_id")
      .notNull()
      .references(() => venueZone.id),
    name: text("name").notNull(),
    priceCents: integer("price_cents").notNull(),
    maxPerOrder: integer("max_per_order").notNull().default(10),
    // general admission only
    capacity: integer("capacity"),
    soldCount: integer("sold_count").notNull().default(0),
    heldCount: integer("held_count").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    unique("event_zone_event_venue_zone_uq").on(t.eventId, t.venueZoneId),
    index("event_zone_venue_zone_id_idx").on(t.venueZoneId),
    check(
      "event_zone_capacity_check",
      sql`${t.soldCount} + ${t.heldCount} <= ${t.capacity}`,
    ),
  ],
);

export const eventSeat = pgTable(
  "event_seat",
  {
    id,
    eventZoneId: uuid("event_zone_id")
      .notNull()
      .references(() => eventZone.id, { onDelete: "cascade" }),
    venueSeatId: uuid("venue_seat_id")
      .notNull()
      .references(() => venueSeat.id),
    status: eventSeatStatus("status").notNull().default("available"),
    ...timestamps,
  },
  (t) => [
    unique("event_seat_zone_venue_seat_uq").on(t.eventZoneId, t.venueSeatId),
    index("event_seat_zone_status_idx").on(t.eventZoneId, t.status),
    index("event_seat_venue_seat_id_idx").on(t.venueSeatId),
  ],
);
