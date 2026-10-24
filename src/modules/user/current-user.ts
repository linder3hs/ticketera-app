import { auth, clerkClient } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { findUserByClerkId, findUserById, type UserRecord } from "@/modules/user/services/user-service";
import { syncClerkUser } from "@/modules/user/services/user-sync-service";
import { IMPERSONATION_COOKIE, parseImpersonationTargetId, resolveImpersonation } from "@/modules/user/user.impersonation";
import { hasRole } from "@/modules/user/user.permissions";
import type { Role } from "@/modules/user/user.types";

/**
 * Local user of the Clerk session (the real one, ignoring impersonation), or
 * `null` when signed out. Creates the row on first access (fallback for a Clerk
 * webhook that hasn't arrived) and re-syncs when the configured super admin
 * hasn't been promoted yet. Memoized per request: a layout and its page share one sync.
 */
const getSessionUser = cache(async (): Promise<UserRecord | null> => {
  const { userId } = await auth();
  if (!userId) return null;

  const existing = await findUserByClerkId(userId);
  const isPendingSuperAdmin =
    existing?.email === process.env.SUPER_ADMIN_EMAIL?.toLowerCase() && existing?.role !== "super_admin";
  if (existing && !existing.deletedAt && !isPendingSuperAdmin) return existing;

  const client = await clerkClient();
  return syncClerkUser(await client.users.getUser(userId));
});

/**
 * Active impersonation of the request: the real super admin and the user they
 * act as. The cookie only counts for a signed-in super admin (other users pay no
 * extra query); an invalid, unknown, deleted or non-eligible target is ignored
 * and yields `null`, never an error. Memoized per request.
 */
export const getImpersonation = cache(async (): Promise<{ real: UserRecord; target: UserRecord } | null> => {
  const real = await getSessionUser();
  if (real?.role !== "super_admin") return null;

  const targetId = parseImpersonationTargetId((await cookies()).get(IMPERSONATION_COOKIE)?.value);
  if (!targetId) return null;

  return resolveImpersonation(real, await findUserById(targetId));
});

/**
 * Effective user of the request: the impersonated user while the super admin
 * acts as someone else, otherwise the session user; `null` when signed out.
 */
export const getCurrentUser = cache(
  async (): Promise<UserRecord | null> => (await getImpersonation())?.target ?? (await getSessionUser()),
);

/** Server guard: signed-in user with at least `minRole`; otherwise redirects. */
export async function requireRole(minRole: Role): Promise<UserRecord> {
  const current = await getCurrentUser();
  if (!current) {
    const { redirectToSignIn } = await auth();
    return redirectToSignIn();
  }
  if (!hasRole(current.role, minRole)) redirect("/");
  return current;
}
