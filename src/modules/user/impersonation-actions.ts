"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { recordAudit } from "@/modules/audit/services/audit-log-service";
import { getImpersonation, requireRole } from "@/modules/user/current-user";
import { findUserById } from "@/modules/user/services/user-service";
import { IMPERSONATION_COOKIE, IMPERSONATION_MAX_AGE_SECONDS } from "@/modules/user/user.impersonation";
import { canImpersonate } from "@/modules/user/user.permissions";
import { impersonateUserSchema } from "@/modules/user/user.schema";
import type { ActionResult } from "@/modules/user/user.types";

/**
 * Lets the super admin act as an organizer or customer. Only returns on error;
 * on success it redirects to the target's home. While impersonating, the
 * effective user isn't the super admin, so nested impersonation is rejected.
 */
export async function startImpersonationAction(input: unknown): Promise<ActionResult> {
  const actor = await requireRole("super_admin");

  const parsed = impersonateUserSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const target = await findUserById(parsed.data.userId);
  if (!target || !canImpersonate(actor, target)) return { ok: false, error: "No puedes impersonar a este usuario." };

  (await cookies()).set(IMPERSONATION_COOKIE, target.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: IMPERSONATION_MAX_AGE_SECONDS,
  });
  await recordAudit({ action: "impersonation.start", targetType: "user", targetId: target.id });
  redirect(target.role === "organizer" ? "/organizer" : "/");
}

/** Ends the impersonation (audited while it's still active) and goes back to the users list. */
export async function stopImpersonationAction(): Promise<void> {
  const impersonation = await getImpersonation();
  if (impersonation) {
    await recordAudit({ action: "impersonation.stop", targetType: "user", targetId: impersonation.target.id });
  }

  (await cookies()).delete(IMPERSONATION_COOKIE);
  redirect("/admin/users");
}
