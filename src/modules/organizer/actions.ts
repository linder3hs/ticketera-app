"use server";

import { revalidatePath } from "next/cache";

import { organizerProfileSchema } from "@/modules/organizer/organizer.schema";
import { requireRole } from "@/modules/user/current-user";
import { updateOrganizerProfile } from "@/modules/user/services/user-service";
import type { ActionResult } from "@/modules/user/user.types";

const INVALID: ActionResult = { ok: false, error: "Datos inválidos." };
const NO_PROFILE: ActionResult = { ok: false, error: "No encontramos tu perfil de organizador." };

/** Saves the business name and RUC of the signed-in organizer. The organizer comes from the session. */
export async function updateOrganizerProfileAction(input: unknown): Promise<ActionResult> {
  const user = await requireRole("organizer");

  // Never echo `parsed.error` or the input: it carries the RUC.
  const parsed = organizerProfileSchema.safeParse(input);
  if (!parsed.success) return INVALID;

  if (!(await updateOrganizerProfile(user.id, parsed.data))) return NO_PROFILE;

  revalidatePath("/organizer/settings");
  return { ok: true, message: "Perfil actualizado." };
}
