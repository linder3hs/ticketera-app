import {
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { refundReason, refundStatus } from "./enums";
import { user } from "./identity";
import { orders, payment } from "./order";
import { ticket } from "./ticket";

export const refund = pgTable(
  "refund",
  {
    id,
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payment.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    amountCents: integer("amount_cents").notNull(),
    reason: refundReason("reason").notNull(),
    status: refundStatus("status").notNull().default("pending"),
    stripeRefundId: text("stripe_refund_id").unique(),
    requestedBy: uuid("requested_by").references(() => user.id),
    ...timestamps,
  },
  (t) => [
    index("refund_payment_id_idx").on(t.paymentId),
    index("refund_order_id_idx").on(t.orderId),
  ],
);

export const refundTicket = pgTable(
  "refund_ticket",
  {
    refundId: uuid("refund_id")
      .notNull()
      .references(() => refund.id, { onDelete: "cascade" }),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => ticket.id),
    ...timestamps,
  },
  (t) => [
    primaryKey({ columns: [t.refundId, t.ticketId] }),
    index("refund_ticket_ticket_id_idx").on(t.ticketId),
  ],
);
