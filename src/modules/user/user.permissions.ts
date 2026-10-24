import type { Role } from "@/modules/user/user.types";

export const ROLES: readonly Role[] = ["super_admin", "admin", "organizer", "customer"];

const RANK: Record<Role, number> = { customer: 0, organizer: 1, admin: 2, super_admin: 3 };

/** Roles the app can hand out; `super_admin` only comes from `SUPER_ADMIN_EMAIL`. */
export const ASSIGNABLE_ROLES = ["admin", "organizer", "customer"] as const satisfies readonly Role[];

/** Lowest role that holds each permission (hierarchy: super_admin > admin > organizer > customer). */
const PERMISSION_MIN_ROLE = {
  "ticket:purchase": "customer",
  "event:manage-own": "organizer",
  "checkin:scan": "organizer",
  "venue:manage-own": "organizer",
  "user:manage-organizers": "admin",
  "event:moderate": "admin",
  "venue:moderate": "admin",
  "refund:manage": "admin",
  "report:view-global": "admin",
  "user:manage-admins": "super_admin",
  "event:publish-any": "super_admin",
  "platform:settings": "super_admin",
} as const satisfies Record<string, Role>;

export type Permission = keyof typeof PERMISSION_MIN_ROLE;

export function hasRole(role: Role, minRole: Role): boolean {
  return RANK[role] >= RANK[minRole];
}

export function can(role: Role, permission: Permission): boolean {
  return hasRole(role, PERMISSION_MIN_ROLE[permission]);
}

/**
 * Whether `actor` may move a user from `current` to `next`. Admins are managed
 * only by the super admin; organizers and customers also by admins; the
 * `super_admin` role is never assigned or removed from the app.
 */
export function canAssignRole(actor: Role, current: Role, next: Role): boolean {
  if (current === "super_admin" || next === "super_admin") return false;
  if (current === "admin" || next === "admin") return can(actor, "user:manage-admins");
  return can(actor, "user:manage-organizers");
}

/**
 * Whether `actor` may edit or remove `target`: never themselves, and only users
 * they could also demote to customer (so never the super admin, and admins
 * only for the super admin).
 */
export function canManageUser(actor: { id: string; role: Role }, target: { id: string; role: Role }): boolean {
  return actor.id !== target.id && canAssignRole(actor.role, target.role, "customer");
}

/**
 * Whether `actor` may act as `target` (impersonation): only the super admin, only
 * over organizers and customers that aren't soft-deleted, never themselves.
 * `canManageUser` doesn't fit: it lets the super admin act on admins.
 */
export function canImpersonate(
  actor: { id: string; role: Role },
  target: { id: string; role: Role; deletedAt?: Date | null },
): boolean {
  return (
    actor.role === "super_admin" &&
    actor.id !== target.id &&
    (target.role === "organizer" || target.role === "customer") &&
    !target.deletedAt
  );
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
