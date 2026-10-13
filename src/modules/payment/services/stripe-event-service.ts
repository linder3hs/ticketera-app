import { eq } from "drizzle-orm";

import { db } from "@/db";
import { stripeEvent } from "@/db/schema";

/** Whether a Stripe event id was already handled (webhook idempotency). */
export async function hasProcessedStripeEvent(id: string): Promise<boolean> {
  const [row] = await db.select({ id: stripeEvent.id }).from(stripeEvent).where(eq(stripeEvent.id, id));
  return Boolean(row);
}

/** Records a handled event; a repeated id is a no-op. */
export async function markStripeEventProcessed(id: string, type: string): Promise<void> {
  await db.insert(stripeEvent).values({ id, type }).onConflictDoNothing();
}
