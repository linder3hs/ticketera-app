"use server";

import { revalidatePath } from "next/cache";

import type { AuditEntry } from "@/modules/audit/audit.types";
import { recordAudit } from "@/modules/audit/services/audit-log-service";
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

/**
 * Runs a staff mutation as the signed-in admin. On success refreshes the users
 * page and records `audit` (its `action` names the mutation; only a super admin's is kept).
 */
async function run(
  mutation: (actor: Awaited<ReturnType<typeof requireRole>>) => Promise<ActionResult>,
  audit: AuditEntry,
) {
  const actor = await requireRole("admin");
  const result = await mutation(actor);
  if (result.ok) {
    revalidatePath("/admin/users");
    await recordAudit(audit);
  }
  return result;
}

export async function inviteStaffAction(input: unknown): Promise<ActionResult> {
  const parsed = inviteStaffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? INVALID_MESSAGE };
  const { email, role } = parsed.data;
  return run((actor) => inviteStaff(actor, email, role), {
    action: "user.invite",
    targetType: "user",
    metadata: { email, role },
  });
}

export async function changeRoleAction(input: unknown): Promise<ActionResult> {
  const parsed = changeRoleSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const { userId, role } = parsed.data;
  return run((actor) => changeUserRole(actor, userId, role), {
    action: "user.change_role",
    targetType: "user",
    targetId: userId,
    metadata: { role },
  });
}

export async function changeOrganizerStatusAction(input: unknown): Promise<ActionResult> {
  const parsed = organizerStatusSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const { userId, status } = parsed.data;
  return run((actor) => changeOrganizerStatus(actor, userId, status), {
    action: "user.change_organizer_status",
    targetType: "user",
    targetId: userId,
    metadata: { status },
  });
}

export async function updateUserAction(input: unknown): Promise<ActionResult> {
  const parsed = updateUserSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const { userId, role, status } = parsed.data;
  return run((actor) => updateUser(actor, userId, role, status), {
    action: "user.update",
    targetType: "user",
    targetId: userId,
    metadata: { role, status },
  });
}

export async function deleteUserAction(input: unknown): Promise<ActionResult> {
  const parsed = deleteUserSchema.safeParse(input);
  if (!parsed.success) return INVALID;
  const { userId } = parsed.data;
  return run((actor) => deleteUser(actor, userId), { action: "user.delete", targetType: "user", targetId: userId });
}
