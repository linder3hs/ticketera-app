import { z } from "zod";

import type { CreateEventInput, OrganizerEventStatus } from "@/modules/organizer/organizer.types";

const required = (message: string) => z.string().trim().min(1, message);

const ticketTypeSchema = z.object({
  name: required("Ponle un nombre."),
  price: z.string().trim().regex(/^\d+(\.\d{1,2})?$/, "Precio inválido."),
  quantity: z.string().trim().regex(/^[1-9]\d*$/, "Mínimo 1."),
});

const name = z.string().trim().min(3, "Escribe el nombre del evento (mínimo 3 caracteres).");

/** A draft only needs a name. */
export const draftEventSchema = z.object({ name }).loose();

/** Publishing needs everything a buyer sees. */
export const publishEventSchema = z.object({
  name,
  category: required("Elige una categoría."),
  description: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elige la fecha."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Elige la hora de inicio."),
  venue: required("Indica el lugar."),
  city: required("Indica la ciudad."),
  imageUrl: z.string(),
  ticketTypes: z.array(ticketTypeSchema).min(1, "Agrega al menos un tipo de entrada."),
});

/**
 * First error per field for saving as `status`, keyed by path
 * ("name", "ticketTypes.0.price"…); `{}` when valid.
 */
export function getCreateEventErrors(values: CreateEventInput, status: OrganizerEventStatus): Record<string, string> {
  const result = (status === "draft" ? draftEventSchema : publishEventSchema).safeParse(values);
  if (result.success) return {};

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/** Tickets on sale across every ticket type (invalid quantities count as 0). */
export function getCapacity(ticketTypes: CreateEventInput["ticketTypes"]): number {
  return ticketTypes.reduce((sum, type) => sum + (Number.parseInt(type.quantity, 10) || 0), 0);
}

/** Cheapest valid price, or `null` if none is set yet. */
export function getLowestPrice(ticketTypes: CreateEventInput["ticketTypes"]): number | null {
  const prices = ticketTypes.map((type) => Number.parseFloat(type.price)).filter((price) => price >= 0);
  return prices.length > 0 ? Math.min(...prices) : null;
}
