import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { cache } from "react";

import { findUserByClerkId, type UserRecord } from "@/modules/user/services/user-service";
import { syncClerkUser } from "@/modules/user/services/user-sync-service";
import { hasRole } from "@/modules/user/user.permissions";
import type { Role } from "@/modules/user/user.types";

/**
 * Local user of the current session, or `null` when signed out. Creates the
 * row on first access (fallback for a Clerk webhook that hasn't arrived) and
 * re-syncs when the configured super admin hasn't been promoted yet.
 * Memoized per request: a layout and its page share one sync.
 */
export const getCurrentUser = cache(async (): Promise<UserRecord | null> => {
  const { userId } = await auth();
  if (!userId) return null;

  const existing = await findUserByClerkId(userId);
  const isPendingSuperAdmin =
    existing?.email === process.env.SUPER_ADMIN_EMAIL?.toLowerCase() && existing?.role !== "super_admin";
  if (existing && !existing.deletedAt && !isPendingSuperAdmin) return existing;

  const client = await clerkClient();
  return syncClerkUser(await client.users.getUser(userId));
});

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
