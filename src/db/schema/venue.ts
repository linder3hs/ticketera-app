import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { seatingType } from "./enums";

export const venue = pgTable(
  "venue",
  {
    id,
    name: text("name").notNull(),
    address: text("address").notNull(),
    city: text("city").notNull(),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    googlePlaceId: text("google_place_id"),
    ...timestamps,
  },
  (t) => [index("venue_city_idx").on(t.city)],
);

export const venueZone = pgTable(
  "venue_zone",
  {
    id,
    venueId: uuid("venue_id")
      .notNull()
      .references(() => venue.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    seatingType: seatingType("seating_type").notNull(),
    capacity: integer("capacity"), // only general_admission
    mapShape: jsonb("map_shape"), // SVG polygon
    color: text("color"),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (t) => [index("venue_zone_venue_id_idx").on(t.venueId)],
);

export const venueSeat = pgTable(
  "venue_seat",
  {
    id,
    venueZoneId: uuid("venue_zone_id")
      .notNull()
      .references(() => venueZone.id, { onDelete: "cascade" }),
    rowLabel: text("row_label").notNull(),
    seatNumber: integer("seat_number").notNull(),
    x: doublePrecision("x"),
    y: doublePrecision("y"),
    ...timestamps,
  },
  (t) => [
    unique("venue_seat_zone_row_number_uq").on(
      t.venueZoneId,
      t.rowLabel,
      t.seatNumber,
    ),
  ],
);
