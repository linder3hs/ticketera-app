import { and, count, desc, eq, ilike, isNull, or } from "drizzle-orm";

import { db } from "@/db";
import { organizer, user } from "@/db/schema";
import { escapeLike } from "@/lib/utils";
import type {
  ClerkProfile,
  OrganizerStatus,
  Role,
  StripeOnboardingStatus,
  UsersPage,
  UsersQuery,
} from "@/modules/user/user.types";

export type UserRecord = typeof user.$inferSelect;

export async function findUserByClerkId(clerkId: string): Promise<UserRecord | undefined> {
  const [row] = await db.select().from(user).where(eq(user.clerkId, clerkId));
  return row;
}

export async function findUserById(id: string): Promise<UserRecord | undefined> {
  const [row] = await db.select().from(user).where(eq(user.id, id));
  return row;
}

/** The organizer profile of a user (approval, tax data and payments onboarding), if they have one. */
export async function findOrganizerByUserId(userId: string): Promise<
  | {
      id: string;
      status: OrganizerStatus;
      businessName: string;
      taxId: string | null;
      stripeAccountId: string | null;
      stripeOnboardingStatus: StripeOnboardingStatus;
    }
  | undefined
> {
  const [row] = await db
    .select({
      id: organizer.id,
      status: organizer.status,
      businessName: organizer.businessName,
      taxId: organizer.taxId,
      stripeAccountId: organizer.stripeAccountId,
      stripeOnboardingStatus: organizer.stripeOnboardingStatus,
    })
    .from(organizer)
    .where(eq(organizer.userId, userId));
  return row;
}

export async function findUserByEmail(email: string): Promise<UserRecord | undefined> {
  const [row] = await db.select().from(user).where(eq(user.email, email));
  return row;
}

/** One page of active users (not soft-deleted) matching `query`, newest first. */
export async function listUsersPage(query: UsersQuery): Promise<UsersPage> {
  const pattern = query.q ? `%${escapeLike(query.q)}%` : undefined;
  const where = and(
    isNull(user.deletedAt),
    query.role ? eq(user.role, query.role) : undefined,
    query.status ? and(eq(user.role, "organizer"), eq(organizer.status, query.status)) : undefined,
    pattern ? or(ilike(user.fullName, pattern), ilike(user.email, pattern)) : undefined,
  );

  const [{ total }] = await db
    .select({ total: count() })
    .from(user)
    .leftJoin(organizer, eq(organizer.userId, user.id))
    .where(where);

  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, pageCount);
  const rows = await db
    .select({ user, organizerStatus: organizer.status })
    .from(user)
    .leftJoin(organizer, eq(organizer.userId, user.id))
    .where(where)
    .orderBy(desc(user.createdAt), desc(user.id))
    .limit(query.pageSize)
    .offset((page - 1) * query.pageSize);

  return {
    items: rows.map(({ user: row, organizerStatus }) => ({
      id: row.id,
      email: row.email,
      fullName: row.fullName,
      role: row.role,
      organizerStatus,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    page,
    pageCount,
  };
}

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

/** Creates the user with `role`, or refreshes its Clerk mirror fields (never the role). */
export async function upsertUser(profile: ClerkProfile, role: Role): Promise<UserRecord> {
  const mirrored = {
    email: profile.email,
    fullName: profile.fullName,
    avatarUrl: profile.avatarUrl,
    authProvider: profile.provider,
    deletedAt: null,
  };

  try {
    const [row] = await db
      .insert(user)
      .values({ clerkId: profile.clerkId, role, ...mirrored })
      .onConflictDoUpdate({ target: user.clerkId, set: mirrored })
      .returning();
    return row;
  } catch (error) {
    // Two first syncs raced (layout + page, or webhook + first access) and both inserted: the
    // loser trips the `email` unique index, which isn't the ON CONFLICT target. The row exists now.
    if (!isUniqueViolation(error)) throw error;
    const [row] = await db.update(user).set(mirrored).where(eq(user.clerkId, profile.clerkId)).returning();
    if (!row) throw error; // same email under another clerk_id: a real conflict
    return row;
  }
}

export async function softDeleteUser(clerkId: string): Promise<void> {
  await db.update(user).set({ deletedAt: new Date() }).where(eq(user.clerkId, clerkId));
}

/**
 * Creates the organizer profile of `target`. With `overwrite` it also resets
 * the status (explicit promotion); without it, an existing profile — e.g. a
 * suspended one — is left untouched.
 */
export async function upsertOrganizer(
  target: Pick<UserRecord, "id" | "fullName" | "email">,
  status: OrganizerStatus,
  overwrite: boolean,
): Promise<void> {
  const insert = db
    .insert(organizer)
    .values({ userId: target.id, businessName: target.fullName ?? target.email, status });

  await (overwrite
    ? insert.onConflictDoUpdate({ target: organizer.userId, set: { status } })
    : insert.onConflictDoNothing());
}

export async function setOrganizerStatus(userId: string, status: OrganizerStatus): Promise<void> {
  await db.update(organizer).set({ status }).where(eq(organizer.userId, userId));
}

/** Saves the tax data of the user's organizer profile. `false` when the user has no organizer row. */
export async function updateOrganizerProfile(
  userId: string,
  profile: { businessName: string; taxId: string },
): Promise<boolean> {
  const rows = await db
    .update(organizer)
    .set({ businessName: profile.businessName, taxId: profile.taxId })
    .where(eq(organizer.userId, userId))
    .returning({ id: organizer.id });
  return rows.length > 0;
}

/**
 * Links the payments account to an organizer and marks onboarding as `pending`, only if none is
 * linked yet. Returns the account id that ends up stored: `accountId`, or the one a concurrent
 * request linked first (`undefined` if the organizer doesn't exist).
 */
export async function setStripeAccountId(organizerId: string, accountId: string): Promise<string | undefined> {
  const [updated] = await db
    .update(organizer)
    .set({ stripeAccountId: accountId, stripeOnboardingStatus: "pending" })
    .where(and(eq(organizer.id, organizerId), isNull(organizer.stripeAccountId)))
    .returning({ stripeAccountId: organizer.stripeAccountId });
  if (updated) return updated.stripeAccountId ?? accountId;

  const [current] = await db
    .select({ stripeAccountId: organizer.stripeAccountId })
    .from(organizer)
    .where(eq(organizer.id, organizerId));
  return current?.stripeAccountId ?? undefined;
}

/** Stores the onboarding status of the organizer linked to `accountId`. `false` when none matches. */
export async function setStripeOnboardingStatus(accountId: string, status: StripeOnboardingStatus): Promise<boolean> {
  const rows = await db
    .update(organizer)
    .set({ stripeOnboardingStatus: status })
    .where(eq(organizer.stripeAccountId, accountId))
    .returning({ id: organizer.id });
  return rows.length > 0;
}

/** Sets the role; organizer role (re)activates the organizer profile, any other suspends it. */
export async function setUserRole(target: UserRecord, role: Role): Promise<UserRecord> {
  const [row] = await db.update(user).set({ role }).where(eq(user.id, target.id)).returning();

  if (role === "organizer") await upsertOrganizer(row, "approved", true);
  else await setOrganizerStatus(row.id, "suspended");

  return row;
}

/**
 * Removes a user from the app: soft-deletes the row and resets the role, so a
 * later sign-up with the same address never comes back as admin/organizer.
 */
export async function retireUser(target: Pick<UserRecord, "id">): Promise<void> {
  await db.update(user).set({ role: "customer", deletedAt: new Date() }).where(eq(user.id, target.id));
  await setOrganizerStatus(target.id, "suspended");
}
