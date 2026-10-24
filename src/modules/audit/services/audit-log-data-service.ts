import { db } from "@/db";
import { auditLog } from "@/db/schema";
import type { NewAuditLog } from "@/modules/audit/audit.types";

/** Appends one row to the audit log. The log is append-only: nothing updates or deletes it. */
export async function insertAuditLog(row: NewAuditLog): Promise<void> {
  await db.insert(auditLog).values(row);
}
