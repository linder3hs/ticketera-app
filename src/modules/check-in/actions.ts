"use server";

import { recordAudit } from "@/modules/audit/services/audit-log-service";
import { checkInInputSchema } from "@/modules/check-in/check-in.schema";
import type { CheckInActionResult } from "@/modules/check-in/check-in.types";
import { checkInTicket } from "@/modules/check-in/services/check-in-service";
import { requireRole } from "@/modules/user/current-user";

/**
 * Validates one scan for the signed-in organizer (or admin). The actor comes
 * from the session, never from the input; the policy decision is the service's.
 * Failures are logged and answered with a generic message.
 */
export async function checkInTicketAction(input: unknown): Promise<CheckInActionResult> {
  const user = await requireRole("organizer");
  const parsed = checkInInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  try {
    const result = await checkInTicket(user, parsed.data);
    // Never the scanned code: it is the ticket itself.
    if (result.ok) {
      await recordAudit({
        action: "check_in.scan",
        targetType: "event",
        targetId: parsed.data.eventId,
        metadata: { result: result.data.result },
      });
    }
    return result;
  } catch (error) {
    console.error("checkInTicketAction", error);
    return { ok: false, error: "No pudimos validar la entrada. Intenta de nuevo." };
  }
}
