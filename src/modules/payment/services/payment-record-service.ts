import { eq } from "drizzle-orm";

import { db } from "@/db";
import { payment } from "@/db/schema";

/** The part of a `payment` row the checkout needs. */
export interface PaymentRecord {
  id: string;
  orderId: string;
  stripePaymentIntentId: string;
}

export interface NewPayment {
  orderId: string;
  stripePaymentIntentId: string;
  amountCents: number;
  applicationFeeCents: number;
  destinationAccountId: string;
}

const recordColumns = {
  id: payment.id,
  orderId: payment.orderId,
  stripePaymentIntentId: payment.stripePaymentIntentId,
};

/** The payment of an order (there is at most one), or `null`. */
export async function findPaymentByOrderId(orderId: string): Promise<PaymentRecord | null> {
  const [row] = await db.select(recordColumns).from(payment).where(eq(payment.orderId, orderId)).limit(1);
  return row ?? null;
}

/** Inserts a `pending` payment. Returns `null` when the order already has one (a concurrent request won). */
export async function insertPayment(values: NewPayment): Promise<PaymentRecord | null> {
  const [row] = await db
    .insert(payment)
    .values({ ...values, status: "pending" })
    .onConflictDoNothing({ target: payment.orderId })
    .returning(recordColumns);
  return row ?? null;
}
