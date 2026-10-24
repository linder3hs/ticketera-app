import type { AuditEntry } from "@/modules/audit/audit.types";
import { insertAuditLog } from "@/modules/audit/services/audit-log-data-service";
import { getCurrentUser, getImpersonation } from "@/modules/user/current-user";

/**
 * Records a super admin action, always attributed to the real super admin
 * (`onBehalfOfUserId` = the impersonated user, if any). A no-op for anyone else.
 * Called after a mutation succeeded, so it never throws: a failure is only
 * logged and the action still answers as if there were no audit.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    const ctx = await getImpersonation();
    const actor = ctx?.real ?? (await getCurrentUser());
    if (actor?.role !== "super_admin") return;

    await insertAuditLog({
      actorUserId: actor.id,
      onBehalfOfUserId: ctx?.target.id ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata ?? null,
    });
  } catch (error) {
    console.error(`recordAudit: could not record "${entry.action}"`, error);
  }
}
