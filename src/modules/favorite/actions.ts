"use server";

import { pgErrorCode } from "@/lib/pg-error";
import { recordAudit } from "@/modules/audit/services/audit-log-service";
import { setFavoriteSchema } from "@/modules/favorite/favorite.schema";
import type { FavoriteActionResult } from "@/modules/favorite/favorite.types";
import { setEventFavorite } from "@/modules/favorite/services/favorite-service";
import { requireRole } from "@/modules/user/current-user";

const FOREIGN_KEY_VIOLATION = "23503";

const FAVORITE_MESSAGES = {
  invalid: "Datos inválidos.",
  eventUnavailable: "Este evento ya no está disponible.",
  generic: "No pudimos guardar el favorito. Intenta de nuevo.",
} as const;

/**
 * Marks or unmarks the event for the signed-in user (signed out → sign-in). The user comes from
 * the session, never from `input`. Idempotent: it applies the desired state, it does not toggle.
 * Failures are logged without personal data (a driver message carries the query parameters).
 * No revalidation: no cached page depends on the favorite.
 */
export async function setEventFavoriteAction(input: unknown): Promise<FavoriteActionResult> {
  const user = await requireRole("customer");
  const parsed = setFavoriteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: FAVORITE_MESSAGES.invalid };

  const { eventId, favorite } = parsed.data;
  try {
    await setEventFavorite(user.id, eventId, favorite);
    await recordAudit({ action: "favorite.set", targetType: "event", targetId: eventId, metadata: { favorite } });
    return { ok: true };
  } catch (error) {
    const code = pgErrorCode(error);
    if (code === FOREIGN_KEY_VIOLATION) return { ok: false, error: FAVORITE_MESSAGES.eventUnavailable };

    console.error("setEventFavoriteAction", { name: error instanceof Error ? error.name : typeof error, code });
    return { ok: false, error: FAVORITE_MESSAGES.generic };
  }
}
