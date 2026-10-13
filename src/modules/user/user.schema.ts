import { z } from "zod";

import { ASSIGNABLE_ROLES, ROLES } from "@/modules/user/user.permissions";
import type { UsersQuery } from "@/modules/user/user.types";

export const inviteStaffSchema = z.object({
  email: z.email("Ingresa un correo válido.").transform((email) => email.toLowerCase()),
  role: z.enum(["admin", "organizer"], "Elige un rol."),
});

export const changeRoleSchema = z.object({ userId: z.uuid(), role: z.enum(ASSIGNABLE_ROLES) });

export const organizerStatusSchema = z.object({
  userId: z.uuid(),
  status: z.enum(["approved", "suspended"]),
});

export const updateUserSchema = z.object({
  userId: z.uuid(),
  role: z.enum(ASSIGNABLE_ROLES),
  status: z.enum(["approved", "suspended"]).optional(),
});

export const deleteUserSchema = z.object({ userId: z.uuid() });

export const USERS_PAGE_SIZES = [8, 16, 24] as const;

/** Anything invalid in the URL falls back to its default instead of failing the page. */
const usersQuerySchema = z.object({
  q: z.string().trim().max(100).catch(""),
  role: z.enum(ROLES).optional().catch(undefined),
  status: z.enum(["pending", "approved", "suspended"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().pipe(z.literal(USERS_PAGE_SIZES)).catch(USERS_PAGE_SIZES[0]),
});

/** Parses Next's `searchParams` (repeated keys keep the first value). */
export function parseUsersQuery(params: Record<string, string | string[] | undefined>): UsersQuery {
  const first = Object.fromEntries(Object.entries(params).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  return usersQuerySchema.parse(first);
}
