"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/modules/user/current-user";
import {
  createVenue,
  createZone,
  deleteVenue,
  deleteZone,
  generateSeats,
  updateVenue,
  updateZone,
} from "@/modules/venue/services/venue-write-service";
import type { VenueActionResult, VenueActor } from "@/modules/venue/venue.types";
import { seatGeneratorSchema, venueSchema, zoneSchema } from "@/modules/venue/venue.schema";

const INVALID_MESSAGE = "Datos inválidos.";
const FAILED_MESSAGE = "No pudimos guardar los cambios. Intenta de nuevo.";

const entityIdSchema = z.object({ id: z.uuid() });
const zoneParentSchema = z.object({ venueId: z.uuid() });
const zoneIdSchema = z.object({ zoneId: z.uuid() });

/** The message of the first error of a form schema (the same the live form shows), or the generic one. */
const firstMessage = (error: z.ZodError) => error.issues[0]?.message ?? INVALID_MESSAGE;

/**
 * Runs a mutation as the signed-in organizer (or admin). The actor comes from
 * the session; the policy decision is the service's. On success refreshes the
 * venue list, the landing and the public event pages (name, color, shape and
 * seats of a zone are shown there). Failures are logged and answered with a
 * generic message.
 */
async function run<T = void>(
  name: string,
  mutation: (actor: VenueActor) => Promise<VenueActionResult<T>>,
): Promise<VenueActionResult<T>> {
  const user = await requireRole("organizer");
  try {
    const result = await mutation({ id: user.id, role: user.role });
    if (result.ok) {
      revalidatePath("/organizer/venues");
      revalidatePath("/");
      revalidatePath("/events", "layout");
    }
    return result;
  } catch (error) {
    console.error(name, error);
    return { ok: false, error: FAILED_MESSAGE };
  }
}

/** `input` is the venue form's values. The owner is the session user. */
export async function createVenueAction(input: unknown): Promise<VenueActionResult<{ id: string }>> {
  const values = venueSchema.safeParse(input);
  if (!values.success) return { ok: false, error: firstMessage(values.error) };
  return run("createVenueAction", (actor) => createVenue(actor, values.data));
}

/** `input` is `{ id, ...venue form values }`. */
export async function updateVenueAction(input: unknown): Promise<VenueActionResult> {
  const id = entityIdSchema.safeParse(input);
  const values = venueSchema.safeParse(input);
  if (!id.success) return { ok: false, error: INVALID_MESSAGE };
  if (!values.success) return { ok: false, error: firstMessage(values.error) };
  return run("updateVenueAction", (actor) => updateVenue(actor, id.data.id, values.data));
}

export async function deleteVenueAction(input: unknown): Promise<VenueActionResult> {
  const parsed = entityIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID_MESSAGE };
  return run("deleteVenueAction", (actor) => deleteVenue(actor, parsed.data.id));
}

/** `input` is `{ venueId, ...zone form values }`. */
export async function createZoneAction(input: unknown): Promise<VenueActionResult<{ id: string }>> {
  const parent = zoneParentSchema.safeParse(input);
  const zone = zoneSchema.safeParse(input);
  if (!parent.success) return { ok: false, error: INVALID_MESSAGE };
  if (!zone.success) return { ok: false, error: firstMessage(zone.error) };
  return run("createZoneAction", (actor) => createZone(actor, parent.data.venueId, zone.data));
}

/** `input` is `{ id, ...zone form values }`. A missing shape keeps the stored one. */
export async function updateZoneAction(input: unknown): Promise<VenueActionResult> {
  const id = entityIdSchema.safeParse(input);
  const zone = zoneSchema.safeParse(input);
  if (!id.success) return { ok: false, error: INVALID_MESSAGE };
  if (!zone.success) return { ok: false, error: firstMessage(zone.error) };
  return run("updateZoneAction", (actor) => updateZone(actor, id.data.id, zone.data));
}

export async function deleteZoneAction(input: unknown): Promise<VenueActionResult> {
  const parsed = entityIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID_MESSAGE };
  return run("deleteZoneAction", (actor) => deleteZone(actor, parsed.data.id));
}

/** `input` is `{ zoneId, ...seat generator form values }`. Replaces the zone's seats. */
export async function generateSeatsAction(input: unknown): Promise<VenueActionResult<{ count: number }>> {
  const target = zoneIdSchema.safeParse(input);
  const generator = seatGeneratorSchema.safeParse(input);
  if (!target.success) return { ok: false, error: INVALID_MESSAGE };
  if (!generator.success) return { ok: false, error: firstMessage(generator.error) };
  return run("generateSeatsAction", (actor) => generateSeats(actor, target.data.zoneId, generator.data));
}
