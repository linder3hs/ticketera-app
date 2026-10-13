import type { authProvider, organizerStatus, stripeOnboardingStatus, userRole } from "@/db/schema";

export type Role = (typeof userRole.enumValues)[number];
export type AuthProvider = (typeof authProvider.enumValues)[number];
export type OrganizerStatus = (typeof organizerStatus.enumValues)[number];
export type StripeOnboardingStatus = (typeof stripeOnboardingStatus.enumValues)[number];

/** Identity data mirrored from Clerk into the `user` table. */
export interface ClerkProfile {
  clerkId: string;
  email: string;
  emailVerified: boolean;
  fullName: string | null;
  avatarUrl: string | null;
  provider: AuthProvider;
  /** `publicMetadata.role` — set by the server (invitations), never by the user. */
  metadataRole: unknown;
}

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

/** Filters of the admin users list, as parsed from the URL. */
export interface UsersQuery {
  q: string;
  role?: Role;
  /** Only matches organizers. */
  status?: OrganizerStatus;
  page: number;
  pageSize: number;
}

/** One row of the users list: what the table shows, safe to send to the client. */
export interface UserRow {
  id: string;
  email: string;
  fullName: string | null;
  role: Role;
  organizerStatus: OrganizerStatus | null;
  /** ISO timestamp. */
  createdAt: string;
}

export interface UsersPage {
  items: UserRow[];
  total: number;
  /** Clamped to the last page when the requested one is out of range. */
  page: number;
  pageCount: number;
}
