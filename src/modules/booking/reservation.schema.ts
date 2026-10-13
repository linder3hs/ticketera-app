import { z } from "zod";

import type { ReserveTicketsInput } from "@/modules/booking/reservation.types";

/** Most seats of one numbered zone, or quantity of one GA zone, in a single reservation. */
export const MAX_TICKETS_PER_ZONE = 6;

const seatRequestSchema = z.object({
  eventZoneId: z.uuid(),
  seatIds: z.array(z.uuid()).min(1).max(MAX_TICKETS_PER_ZONE),
});

const generalAdmissionRequestSchema = z.object({
  eventZoneId: z.uuid(),
  quantity: z.int().min(1).max(MAX_TICKETS_PER_ZONE),
});

/**
 * Server-side input of the reservation action. The slug's format is checked by
 * `getPublicEventDetail`; unknown keys are dropped.
 */
export const reserveTicketsSchema = z
  .object({
    slug: z.string().min(1),
    seats: z.array(seatRequestSchema),
    generalAdmission: z.array(generalAdmissionRequestSchema),
  })
  .superRefine(({ seats, generalAdmission }, ctx) => {
    if (seats.length + generalAdmission.length === 0) {
      ctx.addIssue({ code: "custom", message: "Elige al menos una entrada." });
    }

    const zoneIds = [...seats, ...generalAdmission].map((request) => request.eventZoneId);
    if (new Set(zoneIds).size !== zoneIds.length) {
      ctx.addIssue({ code: "custom", message: "Zona repetida." });
    }

    const seatIds = seats.flatMap((request) => request.seatIds);
    if (new Set(seatIds).size !== seatIds.length) {
      ctx.addIssue({ code: "custom", message: "Asiento repetido." });
    }
  }) satisfies z.ZodType<ReserveTicketsInput>;
