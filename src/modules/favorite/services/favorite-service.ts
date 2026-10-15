import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { eventFavorite } from "@/db/schema";

/** Idempotente: marcar dos veces o desmarcar algo no marcado no falla. */
export async function setEventFavorite(userId: string, eventId: string, favorite: boolean): Promise<void> {
  if (favorite) {
    await db.insert(eventFavorite).values({ userId, eventId }).onConflictDoNothing({ target: [eventFavorite.userId, eventFavorite.eventId] });
    return;
  }

  await db.delete(eventFavorite).where(and(eq(eventFavorite.userId, userId), eq(eventFavorite.eventId, eventId)));
}

export async function isEventFavorite(userId: string, eventId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: eventFavorite.id })
    .from(eventFavorite)
    .where(and(eq(eventFavorite.userId, userId), eq(eventFavorite.eventId, eventId)))
    .limit(1);

  return row !== undefined;
}

export async function listFavoriteEventIds(userId: string): Promise<string[]> {
  const rows = await db.select({ eventId: eventFavorite.eventId }).from(eventFavorite).where(eq(eventFavorite.userId, userId));

  return rows.map((row) => row.eventId);
}
