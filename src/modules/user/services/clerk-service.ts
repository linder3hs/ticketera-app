import { clerkClient } from "@clerk/nextjs/server";

import { getAppUrl } from "@/lib/env";
import type { Role } from "@/modules/user/user.types";

/** Mirrors the DB role (source of truth) into Clerk's `publicMetadata`, read by `proxy.ts`. */
export async function syncRoleToClerk(clerkId: string, role: Role): Promise<void> {
  const client = await clerkClient();
  await client.users.updateUserMetadata(clerkId, { publicMetadata: { role } });
}

/** Where the invitation link lands: our own sign-up page, which reads the invitation ticket from the URL. */
function inviteRedirectUrl(): string {
  return new URL("/sign-up", getAppUrl()).toString();
}

/** Emails an invitation; the role travels in the invitation's server-set metadata. */
export async function inviteToClerk(email: string, role: Role): Promise<void> {
  const client = await clerkClient();
  await client.invitations.createInvitation({
    emailAddress: email,
    publicMetadata: { role },
    redirectUrl: inviteRedirectUrl(),
    ignoreExisting: true,
  });
}

/** Deletes the Clerk account; the DB row is retired separately. */
export async function deleteClerkUser(clerkId: string): Promise<void> {
  const client = await clerkClient();
  await client.users.deleteUser(clerkId);
}
