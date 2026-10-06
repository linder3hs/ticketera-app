"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/modules/user/current-user";
import {
  changeOrganizerStatus,
  changeUserRole,
  deleteUser,
  inviteStaff,
  updateUser,
} from "@/modules/user/services/staff-service";
import {
  changeRoleSchema,
  deleteUserSchema,
  inviteStaffSchema,
  organizerStatusSchema,
  updateUserSchema,
} from "@/modules/user/user.schema";
import type { ActionResult } from "@/modules/user/user.types";

const INVALID_MESSAGE = "Datos inválidos.";
const INVALID: ActionResult = { ok: false, error: INVALID_MESSAGE };

/** Runs a staff mutation as the signed-in admin and refreshes the users page. */
async function run(mutation: (actor: Awaited<ReturnType<typeof requireRole>>) => Promise<ActionResult>) {
  const actor = await requireRole("admin");
  const result = await mutation(actor);
  if (result.ok) revalidatePath("/admin/users");
  return result;
}

export async function inviteStaffAction(input: unknown): Promise<ActionResult> {
  const parsed = inviteStaffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? INVALID_MESSAGE };
  return run((actor) => inviteStaff(actor, parsed.data.email, parsed.data.role));
}

export async function changeRoleAction(input: unknown): Promise<ActionResult> {
  const parsed = changeRoleSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  return run((actor) => changeUserRole(actor, parsed.data.userId, parsed.data.role));
}

export async function changeOrganizerStatusAction(input: unknown): Promise<ActionResult> {
  const parsed = organizerStatusSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  return run((actor) => changeOrganizerStatus(actor, parsed.data.userId, parsed.data.status));
}

export async function updateUserAction(input: unknown): Promise<ActionResult> {
  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  return run((actor) => updateUser(actor, parsed.data.userId, parsed.data.role, parsed.data.status));
}

export async function deleteUserAction(input: unknown): Promise<ActionResult> {
  const parsed = deleteUserSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  return run((actor) => deleteUser(actor, parsed.data.userId));
}
