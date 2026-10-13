import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { event, orderItem, orders, organizer } from "@/db/schema";
import type { BuyerDocumentType } from "@/modules/booking/buyer.schema";
import type { OrderAmounts, OrderItemSource } from "@/modules/booking/checkout.types";
import { generateOrderCode, toOrderItems } from "@/modules/booking/checkout.utils";
import type { StripeOnboardingStatus } from "@/modules/user/user.types";

/** The buyer's data as the order snapshots it. */
export interface BuyerSnapshot {
  fullName: string;
  email: string;
  documentType: BuyerDocumentType;
  documentNumber: string;
  phone: string;
}

/** The part of an `orders` row the checkout needs. */
export interface StoredOrder extends OrderAmounts {
  id: string;
  code: string;
  status: (typeof orders.$inferSelect)["status"];
}

export interface PayoutAccount {
  accountId: string | null;
  onboardingStatus: StripeOnboardingStatus;
}

/** The Connect account of the event's organizer; `null` when the event does not exist. */
export async function findPayoutAccount(eventId: string): Promise<PayoutAccount | null> {
  const [row] = await db
    .select({ accountId: organizer.stripeAccountId, onboardingStatus: organizer.stripeOnboardingStatus })
    .from(event)
    .innerJoin(organizer, eq(organizer.id, event.organizerId))
    .where(eq(event.id, eventId))
    .limit(1);
  return row ?? null;
}

/** The order of a reservation (there is at most one: unique `reservation_id`), or `null`. */
export async function findOrderByReservation(reservationId: string): Promise<StoredOrder | null> {
  const [row] = await db
    .select({
      id: orders.id,
      code: orders.code,
      status: orders.status,
      subtotalCents: orders.subtotalCents,
      platformFeeCents: orders.platformFeeCents,
      totalCents: orders.totalCents,
    })
    .from(orders)
    .where(eq(orders.reservationId, reservationId))
    .limit(1);
  return row ?? null;
}

export interface NewPendingOrder {
  userId: string;
  eventId: string;
  reservationId: string;
  items: OrderItemSource[];
  amounts: OrderAmounts;
  buyer: BuyerSnapshot;
}

/**
 * Inserts a `pending` order and one `order_item` per ticket in a single batch (one transaction).
 * It throws, rolling everything back, when the reservation already has an order (`23505`).
 * The ids are generated here because a batch statement cannot read another one's `RETURNING`.
 */
export async function createPendingOrder({
  userId,
  eventId,
  reservationId,
  items,
  amounts,
  buyer,
}: NewPendingOrder): Promise<StoredOrder> {
  const id = crypto.randomUUID();
  const code = generateOrderCode();

  await db.batch([
    db.insert(orders).values({
      id,
      code,
      userId,
      eventId,
      reservationId,
      status: "pending",
      ...amounts,
      ...toBuyerColumns(buyer),
      termsAcceptedAt: new Date(),
    }),
    db.insert(orderItem).values(toOrderItems(id, items)),
  ]);

  return { id, code, status: "pending", ...amounts };
}

/** Replaces the buyer snapshot of an order that is still `pending`; amounts and terms stay. */
export async function updateBuyerSnapshot(orderId: string, buyer: BuyerSnapshot): Promise<void> {
  await db
    .update(orders)
    .set(toBuyerColumns(buyer))
    .where(and(eq(orders.id, orderId), eq(orders.status, "pending")));
}

function toBuyerColumns(buyer: BuyerSnapshot) {
  return {
    buyerName: buyer.fullName,
    buyerEmail: buyer.email,
    buyerDocumentType: buyer.documentType,
    buyerDocumentNumber: buyer.documentNumber,
    buyerPhone: buyer.phone,
  };
}
