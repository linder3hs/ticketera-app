import type { auditLog } from "@/db/schema"; // types only: keeps drizzle out of the client bundle

/** Input of `recordAudit`: what was done and on which resource. The actor is resolved inside. */
export interface AuditEntry {
  /** `<domain>.<verb_snake>`, e.g. `user.change_role`. */
  action: string;
  /** Kind of resource, e.g. `user`, `event`, `venue`. */
  targetType?: string;
  /** Id or code of the resource. */
  targetId?: string;
  /** Parsed input without secrets: never Stripe URLs, client secrets, scanned codes or buyer data. */
  metadata?: Record<string, unknown>;
}

/** Row appended to `audit_log` (`id` and `created_at` take their defaults). */
export type NewAuditLog = typeof auditLog.$inferInsert;
