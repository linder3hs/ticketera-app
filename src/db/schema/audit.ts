import { index, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import { user } from "./identity";

// Append-only log of super admin actions (no updated_at), always attributed to the real actor.
export const auditLog = pgTable(
  "audit_log",
  {
    id,
    actorUserId: uuid("actor_user_id")
      .notNull()
      .references(() => user.id),
    // Impersonated user; NULL when the actor acts as themselves.
    onBehalfOfUserId: uuid("on_behalf_of_user_id").references(() => user.id),
    action: text("action").notNull(), // <domain>.<verb_snake>
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index("audit_log_actor_created_idx").on(t.actorUserId, t.createdAt),
    index("audit_log_created_idx").on(t.createdAt),
  ],
);
