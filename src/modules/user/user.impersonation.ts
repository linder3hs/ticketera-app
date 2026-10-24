import { z } from "zod";

import { canImpersonate } from "@/modules/user/user.permissions";
import type { Role } from "@/modules/user/user.types";

/** Holds the `user.id` the super admin acts as; re-validated against the real user on every request. */
export const IMPERSONATION_COOKIE = "impersonate_user_id";

/** Long enough to survive the round trip through Stripe's hosted onboarding pages. */
export const IMPERSONATION_MAX_AGE_SECONDS = 8 * 60 * 60;

const targetIdSchema = z.uuid();

/** The target id stored in the cookie, or `null` when it's missing or not a uuid. */
export function parseImpersonationTargetId(value: string | undefined): string | null {
  const parsed = targetIdSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** `{ real, target }` when `real` may act as `target`; `null` otherwise (no target or an invalid one). */
export function resolveImpersonation<
  A extends { id: string; role: Role },
  T extends { id: string; role: Role; deletedAt?: Date | null },
>(real: A, target: T | undefined): { real: A; target: T } | null {
  return target && canImpersonate(real, target) ? { real, target } : null;
}
