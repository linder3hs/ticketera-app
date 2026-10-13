import { deleteClerkUser, inviteToClerk, syncRoleToClerk } from "@/modules/user/services/clerk-service";
import {
  findUserByEmail,
  findUserById,
  retireUser,
  setOrganizerStatus as saveOrganizerStatus,
  setUserRole,
  type UserRecord,
} from "@/modules/user/services/user-service";
import { can, canAssignRole, canManageUser } from "@/modules/user/user.permissions";
import type { ActionResult, OrganizerStatus, Role } from "@/modules/user/user.types";

const FORBIDDEN: ActionResult = { ok: false, error: "No tienes permiso para esta acción." };
const NOT_FOUND: ActionResult = { ok: false, error: "Usuario no encontrado." };

/** Changes the role of `userId` on behalf of `actor`, mirroring it into Clerk. */
export async function changeUserRole(actor: UserRecord, userId: string, role: Role): Promise<ActionResult> {
  const target = await findUserById(userId);
  if (!target) return { ok: false, error: "Usuario no encontrado." };
  if (target.id === actor.id) return { ok: false, error: "No puedes cambiar tu propio rol." };
  if (!canAssignRole(actor.role, target.role, role)) return FORBIDDEN;
  if (target.role === role) return { ok: true };

  await setUserRole(target, role);
  await syncRoleToClerk(target.clerkId, role);
  return { ok: true, message: "Rol actualizado." };
}

/** Approves or suspends an organizer. */
export async function changeOrganizerStatus(
  actor: UserRecord,
  userId: string,
  status: OrganizerStatus,
): Promise<ActionResult> {
  if (!can(actor.role, "user:manage-organizers")) return FORBIDDEN;

  const target = await findUserById(userId);
  if (target?.role !== "organizer") return { ok: false, error: "El usuario no es organizador." };

  await saveOrganizerStatus(userId, status);
  return { ok: true, message: status === "approved" ? "Organizador aprobado." : "Organizador suspendido." };
}

/**
 * Gives staff access to `email`: an existing user gets the role right away; a
 * new one gets an invitation and receives the role when they sign up.
 */
export async function inviteStaff(actor: UserRecord, email: string, role: "admin" | "organizer"): Promise<ActionResult> {
  if (!canAssignRole(actor.role, "customer", role)) return FORBIDDEN;

  const existing = await findUserByEmail(email);
  if (existing) return changeUserRole(actor, existing.id, role);

  await inviteToClerk(email, role);
  return { ok: true, message: `Invitación enviada a ${email}.` };
}

/** Applies a role and, for organizers, an approval status in one go. */
export async function updateUser(
  actor: UserRecord,
  userId: string,
  role: Role,
  status?: Exclude<OrganizerStatus, "pending">,
): Promise<ActionResult> {
  const target = await findUserById(userId);
  if (!target || target.deletedAt) return NOT_FOUND;
  if (!canManageUser(actor, target)) return FORBIDDEN;

  if (role !== target.role) {
    const changed = await changeUserRole(actor, userId, role);
    if (!changed.ok) return changed;
  }
  if (role === "organizer" && status) {
    const moderated = await changeOrganizerStatus(actor, userId, status);
    if (!moderated.ok) return moderated;
  }
  return { ok: true, message: "Cambios guardados." };
}

/** Deletes the Clerk account first, so a failure there leaves the DB untouched. */
export async function deleteUser(actor: UserRecord, userId: string): Promise<ActionResult> {
  const target = await findUserById(userId);
  if (!target || target.deletedAt) return NOT_FOUND;
  if (!canManageUser(actor, target)) return FORBIDDEN;

  await deleteClerkUser(target.clerkId);
  await retireUser(target);
  return { ok: true, message: "Usuario eliminado." };
}
