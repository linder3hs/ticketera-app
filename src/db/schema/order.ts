import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { documentType, orderStatus, paymentStatus } from "./enums";
import { event, eventSeat, eventZone } from "./event";
import { user } from "./identity";
import { reservation } from "./reservation";

export const orders = pgTable(
  "orders",
  {
    id,
    code: text("code").notNull().unique(), // e.g. TK-24817
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id),
    reservationId: uuid("reservation_id").references(() => reservation.id),
    status: orderStatus("status").notNull().default("pending"),
    subtotalCents: integer("subtotal_cents").notNull(),
    platformFeeCents: integer("platform_fee_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    // buyer snapshot
    buyerName: text("buyer_name").notNull(),
    buyerEmail: text("buyer_email").notNull(),
    buyerDocumentType: documentType("buyer_document_type"),
    buyerDocumentNumber: text("buyer_document_number"),
    buyerPhone: text("buyer_phone"),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("orders_user_id_created_at_idx").on(t.userId, t.createdAt),
    index("orders_event_id_idx").on(t.eventId),
    uniqueIndex("orders_reservation_id_unique").on(t.reservationId),
  ],
);

export const orderItem = pgTable(
  "order_item",
  {
    id,
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    eventZoneId: uuid("event_zone_id")
      .notNull()
      .references(() => eventZone.id),
    eventSeatId: uuid("event_seat_id").references(() => eventSeat.id), // null if GA
    unitPriceCents: integer("unit_price_cents").notNull(),
    ...timestamps,
  },
  (t) => [
    index("order_item_order_id_idx").on(t.orderId),
    index("order_item_event_zone_id_idx").on(t.eventZoneId),
    index("order_item_event_seat_id_idx").on(t.eventSeatId),
  ],
);

export const payment = pgTable("payment", {
  id,
  orderId: uuid("order_id")
    .notNull()
    .unique()
    .references(() => orders.id),
  stripePaymentIntentId: text("stripe_payment_intent_id").notNull().unique(),
  stripeChargeId: text("stripe_charge_id"),
  status: paymentStatus("status").notNull().default("pending"),
  amountCents: integer("amount_cents").notNull(),
  applicationFeeCents: integer("application_fee_cents").notNull(),
  destinationAccountId: text("destination_account_id"),
  ...timestamps,
});

// webhook idempotency: PK = Stripe event id
export const stripeEvent = pgTable("stripe_event", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  ...timestamps,
});
