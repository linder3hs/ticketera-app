import type { User } from "@clerk/nextjs/server";

import { syncRoleToClerk } from "@/modules/user/services/clerk-service";
import {
  setUserRole,
  upsertOrganizer,
  upsertUser,
  type UserRecord,
} from "@/modules/user/services/user-service";
import { isSuperAdmin, resolveInitialRole, toProfile } from "@/modules/user/user.profile";

/**
 * Brings the local `user` row in line with a Clerk user: creates it (role from
 * `resolveInitialRole`), refreshes the mirrored fields, promotes the configured
 * super admin and pushes the role back to Clerk when it differs.
 */
export async function syncClerkUser(clerkUser: User): Promise<UserRecord | null> {
  const profile = toProfile(clerkUser);
  if (!profile) return null;

  const superAdminEmail = process.env.SUPER_ADMIN_EMAIL;
  let current = await upsertUser(profile, resolveInitialRole(profile, superAdminEmail));

  if (isSuperAdmin(profile, superAdminEmail) && current.role !== "super_admin") {
    current = await setUserRole(current, "super_admin");
  } else if (current.role === "organizer") {
    await upsertOrganizer(current, "approved", false);
  }

  if (clerkUser.publicMetadata?.role !== current.role) {
    await syncRoleToClerk(current.clerkId, current.role);
  }

  return current;
}
