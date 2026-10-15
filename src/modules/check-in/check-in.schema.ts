import { z } from "zod";

import { normalizeScannedCode } from "@/modules/check-in/check-in.utils";

/** Longest raw text accepted from a scanner or the manual field. */
export const MAX_SCANNED_CODE_LENGTH = 256;

/**
 * A scan request. The code format is not enforced: text that does not look
 * like a ticket token is answered (and recorded) as `invalid`, not rejected.
 */
export const checkInInputSchema = z.object({
  eventId: z.uuid("Evento inválido."),
  code: z
    .string()
    .max(MAX_SCANNED_CODE_LENGTH, "El código es demasiado largo.")
    .transform(normalizeScannedCode)
    .pipe(z.string().min(1, "Ingresa el código de la entrada.")),
});

export type CheckInInput = z.infer<typeof checkInInputSchema>;
