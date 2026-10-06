"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { eventListQuerySchema } from "@/modules/event/event-list.schema";
import type { EventsResult } from "@/modules/event/event-list.types";
import { createEventWriteSchema } from "@/modules/event/event-write.schema";
import type { EventActionResult, PolicyActor } from "@/modules/event/event-write.types";
import {
  createEvent,
  deleteEvent,
  setEventFeatured,
  setEventStatus,
  updateEvent,
} from "@/modules/event/services/event-write-service";
import { listManagedEvents, resolvePolicyActor } from "@/modules/event/services/event-list-service";
import { requireRole } from "@/modules/user/current-user";

const INVALID_MESSAGE = "Datos inválidos.";
const FAILED_MESSAGE = "No pudimos guardar los cambios. Intenta de nuevo.";

const eventIdSchema = z.object({ id: z.uuid() });
const setStatusSchema = eventIdSchema.extend({ status: z.enum(["published", "draft", "cancelled"]) });
const setFeaturedSchema = eventIdSchema.extend({ featured: z.boolean() });
/** Saving through the form always keeps the event a draft: publishing is `setEventStatusAction`. */
const draftSchema = createEventWriteSchema("draft");

/** Events the signed-in organizer (or admin) may see. Scope is decided here from the session, not by the input. */
export async function listEventsAction(input: unknown): Promise<EventsResult> {
  const actor = await requireRole("organizer");
  const parsed = eventListQuerySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  try {
    return { ok: true, data: await listManagedEvents(actor, parsed.data) };
  } catch (error) {
    console.error("listEventsAction", error);
    return { ok: false, error: "No pudimos cargar los eventos." };
  }
}

/**
 * Runs a mutation as the signed-in organizer (or admin) and refreshes the panel
 * and the landing (every event change can alter it). The actor comes from the
 * session and the `organizer` row; the policy decision is the service's.
 * Failures are logged and answered with a generic message.
 */
async function run<T = void>(
  name: string,
  mutation: (actor: PolicyActor) => Promise<EventActionResult<T>>,
): Promise<EventActionResult<T>> {
  const user = await requireRole("organizer");
  try {
    const result = await mutation(await resolvePolicyActor(user));
    if (result.ok) {
      revalidatePath("/organizer");
      revalidatePath("/");
    }
    return result;
  } catch (error) {
    console.error(name, error);
    return { ok: false, error: FAILED_MESSAGE };
  }
}

/** Creates a draft owned by the signed-in organizer (or, for admins, by `input.organizerId`). `input` is the form's values. */
export async function createEventAction(input: unknown): Promise<EventActionResult<{ id: string }>> {
  const parsed = draftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? INVALID_MESSAGE };
  // Only admins' requests use it (`createEvent` ignores it for organizers).
  const { organizerId } = z.object({ organizerId: z.uuid().optional() }).catch({}).parse(input);
  return run("createEventAction", (actor) => createEvent(actor, parsed.data, organizerId));
}

/** `input` is `{ id, ...form values }`. */
export async function updateEventAction(input: unknown): Promise<EventActionResult> {
  const id = eventIdSchema.safeParse(input);
  const values = draftSchema.safeParse(input);
  if (!id.success) return { ok: false, error: INVALID_MESSAGE };
  if (!values.success) return { ok: false, error: values.error.issues[0]?.message ?? INVALID_MESSAGE };
  return run("updateEventAction", (actor) => updateEvent(actor, id.data.id, values.data));
}

export async function deleteEventAction(input: unknown): Promise<EventActionResult> {
  const parsed = eventIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID_MESSAGE };
  return run("deleteEventAction", (actor) => deleteEvent(actor, parsed.data.id));
}

/** Publish, unpublish or cancel. The single door for status changes. */
export async function setEventStatusAction(input: unknown): Promise<EventActionResult> {
  const parsed = setStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID_MESSAGE };
  return run("setEventStatusAction", (actor) => setEventStatus(actor, parsed.data.id, parsed.data.status));
}

/** Marks or unmarks the event as featured on the landing. Whether the actor is a moderator is the service's call. */
export async function setEventFeaturedAction(input: unknown): Promise<EventActionResult> {
  const parsed = setFeaturedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID_MESSAGE };
  return run("setEventFeaturedAction", (actor) => setEventFeatured(actor, parsed.data.id, parsed.data.featured));
}
