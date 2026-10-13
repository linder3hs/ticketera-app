import type { User } from "@clerk/nextjs/server";

import type { ClerkProfile, Role } from "@/modules/user/user.types";

/** Maps a Clerk backend user to the data we mirror locally. */
export function toProfile(user: User): ClerkProfile | null {
  const primary = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId);
  if (!primary) return null;

  const isGoogle = user.externalAccounts.some((account) => account.provider.includes("google"));

  return {
    clerkId: user.id,
    email: primary.emailAddress.toLowerCase(),
    emailVerified: primary.verification?.status === "verified",
    fullName: [user.firstName, user.lastName].filter(Boolean).join(" ") || null,
    avatarUrl: user.imageUrl || null,
    provider: isGoogle ? "google" : "email",
    metadataRole: user.publicMetadata?.role,
  };
}

export function isSuperAdmin(
  profile: Pick<ClerkProfile, "email" | "emailVerified">,
  superAdminEmail: string | undefined,
): boolean {
  return Boolean(superAdminEmail) && profile.emailVerified && profile.email === superAdminEmail?.toLowerCase();
}

/**
 * Role of a brand-new user. Only the (verified) super admin email or a role
 * set server-side by an invitation raise it; everyone else is a customer.
 */
export function resolveInitialRole(profile: ClerkProfile, superAdminEmail: string | undefined): Role {
  if (isSuperAdmin(profile, superAdminEmail)) return "super_admin";
  if (profile.metadataRole === "admin" || profile.metadataRole === "organizer") return profile.metadataRole;
  return "customer";
}
