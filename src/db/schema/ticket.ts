import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { checkInResult, ticketStatus } from "./enums";
import { event } from "./event";
import { user } from "./identity";
import { orderItem } from "./order";

export const ticket = pgTable(
  "ticket",
  {
    id,
    orderItemId: uuid("order_item_id")
      .notNull()
      .unique()
      .references(() => orderItem.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id),
    holderName: text("holder_name").notNull(),
    code: text("code").notNull().unique(), // QR token
    status: ticketStatus("status").notNull().default("valid"),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("ticket_event_id_status_idx").on(t.eventId, t.status)],
);

export const checkIn = pgTable(
  "check_in",
  {
    id,
    // NULL when the scanned code matches no ticket (see check constraint).
    ticketId: uuid("ticket_id").references(() => ticket.id),
    // Event of the gate where the scan happened.
    eventId: uuid("event_id").references(() => event.id),
    // Scanned text (max 64 chars); only written when ticketId is NULL.
    scannedCode: text("scanned_code"),
    scannedBy: uuid("scanned_by")
      .notNull()
      .references(() => user.id),
    scannedAt: timestamp("scanned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    result: checkInResult("result").notNull(),
    ...timestamps,
  },
  (t) => [
    index("check_in_ticket_id_idx").on(t.ticketId),
    index("check_in_scanned_by_idx").on(t.scannedBy),
    check(
      "check_in_ticket_or_scanned_code_check",
      sql`${t.ticketId} IS NOT NULL OR (${t.eventId} IS NOT NULL AND ${t.scannedCode} IS NOT NULL)`,
    ),
  ],
);
