import { check, index, integer, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, timestamps } from "./columns";
import { reservationStatus } from "./enums";
import { event, eventSeat, eventZone } from "./event";
import { user } from "./identity";

export const reservation = pgTable(
  "reservation",
  {
    id,
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id),
    status: reservationStatus("status").notNull().default("active"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    index("reservation_status_expires_at_idx").on(t.status, t.expiresAt),
    index("reservation_user_id_idx").on(t.userId),
    index("reservation_event_id_idx").on(t.eventId),
  ],
);

export const reservationItem = pgTable(
  "reservation_item",
  {
    id,
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => reservation.id, { onDelete: "cascade" }),
    eventZoneId: uuid("event_zone_id")
      .notNull()
      .references(() => eventZone.id),
    eventSeatId: uuid("event_seat_id").references(() => eventSeat.id), // null if GA
    quantity: integer("quantity").notNull().default(1),
    ...timestamps,
  },
  (t) => [
    index("reservation_item_reservation_id_idx").on(t.reservationId),
    index("reservation_item_event_zone_id_idx").on(t.eventZoneId),
    index("reservation_item_event_seat_id_idx").on(t.eventSeatId),
    check("reservation_item_quantity_check", sql`${t.quantity} > 0`),
  ],
);
