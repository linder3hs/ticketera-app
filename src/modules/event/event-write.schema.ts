import { z } from "zod";

import { toLimaDate } from "@/modules/event/event-list.utils";
import type { EventFormValues, EventIntent, EventWriteInput } from "@/modules/event/event-write.types";
import { parsePriceToCents, toStartsAt } from "@/modules/event/event-write.utils";

/** Largest value of a Postgres `integer` column (`price_cents`, `capacity`). */
const MAX_INT = 2_147_483_647;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** `YYYY-MM-DD` that exists on the calendar (rejects `2027-02-30`, which `Date` would roll over). */
function isCalendarDate(date: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  return utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day;
}

function isEmptyOrHttps(value: string): boolean {
  if (value === "") return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** A zone without a price is "not for sale" and is dropped later, so only priced zones are checked. */
const zoneSchema = z
  .object({
    venueZoneId: z.uuid("Zona inválida."),
    price: z.string().trim(),
    capacity: z.string().trim(),
  })
  .superRefine((zone, ctx) => {
    if (zone.price === "") return;

    const cents = parsePriceToCents(zone.price);
    if (cents === null || cents <= 0) {
      ctx.addIssue({ code: "custom", path: ["price"], message: "Precio inválido: mayor que 0, con hasta 2 decimales." });
    } else if (cents > MAX_INT) {
      ctx.addIssue({ code: "custom", path: ["price"], message: "Precio demasiado alto." });
    }

    if (zone.capacity === "") return;
    if (!/^[1-9]\d*$/.test(zone.capacity) || Number(zone.capacity) > MAX_INT) {
      ctx.addIssue({ code: "custom", path: ["capacity"], message: "Capacidad inválida: número entero, mínimo 1." });
    }
  });

/**
 * One definition for the form (live validation) and the server. Input = form
 * strings; output = domain types (`startsAt: Date`, `priceCents`, `capacity`).
 * `now` is injected so "must be in the future" is deterministic in tests.
 */
export function createEventWriteSchema(intent: EventIntent, now: Date = new Date()) {
  return z
    .object({
      title: z.string().trim().min(3, "Escribe el nombre del evento (mínimo 3 caracteres)."),
      description: z.string().trim(),
      categoryId: z.uuid("Elige una categoría."),
      venueId: z.uuid("Elige un recinto."),
      date: z.string().refine(isCalendarDate, "Elige la fecha."),
      time: z.string().regex(TIME_PATTERN, "Elige la hora de inicio."),
      coverImageUrl: z.string().trim().refine(isEmptyOrHttps, "La portada debe ser una URL https."),
      zones: z.array(zoneSchema),
    })
    .superRefine((values, ctx) => {
      if (isCalendarDate(values.date) && TIME_PATTERN.test(values.time) && toStartsAt(values.date, values.time) <= now) {
        // A past day is the date's fault; today with a past hour is the time's.
        const field = values.date < toLimaDate(now) ? "date" : "time";
        ctx.addIssue({ code: "custom", path: [field], message: "La fecha y hora deben ser futuras." });
      }

      const seen = new Set<string>();
      values.zones.forEach((zone, index) => {
        if (seen.has(zone.venueZoneId)) {
          ctx.addIssue({ code: "custom", path: ["zones", index, "venueZoneId"], message: "Zona repetida." });
        }
        seen.add(zone.venueZoneId);
      });

      if (intent === "publish" && !values.zones.some((zone) => zone.price !== "")) {
        ctx.addIssue({ code: "custom", path: ["zones"], message: "Agrega al menos una zona con precio." });
      }
    })
    .transform(
      (values): EventWriteInput => ({
        title: values.title,
        description: values.description || null,
        categoryId: values.categoryId,
        venueId: values.venueId,
        startsAt: toStartsAt(values.date, values.time),
        coverImageUrl: values.coverImageUrl || null,
        zones: values.zones
          .filter((zone) => zone.price !== "")
          .map((zone) => ({
            venueZoneId: zone.venueZoneId,
            priceCents: parsePriceToCents(zone.price) ?? 0,
            capacity: zone.capacity === "" ? null : Number(zone.capacity),
          })),
      }),
    );
}

/**
 * First error per field for saving with `intent`, keyed by path
 * ("title", "zones.0.price"…); `{}` when valid.
 */
export function getEventWriteErrors(values: EventFormValues, intent: EventIntent, now?: Date): Record<string, string> {
  const result = createEventWriteSchema(intent, now).safeParse(values);
  if (result.success) return {};

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}
