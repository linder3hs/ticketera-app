"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { AuditEntry } from "@/modules/audit/audit.types";
import { recordAudit } from "@/modules/audit/services/audit-log-service";
import { eventListQuerySchema } from "@/modules/event/event-list.schema";
import type { EventsResult } from "@/modules/event/event-list.types";
import { coverUploadSchema, createEventWriteSchema } from "@/modules/event/event-write.schema";
import type { CoverUpload, EventActionResult, PolicyActor } from "@/modules/event/event-write.types";
import { createCoverUpload } from "@/modules/event/services/cover-upload-service";
import {
  createEvent,
  deleteEvent,
  retryEventRefunds,
  setEventFeatured,
  setEventStatus,
  updateEvent,
} from "@/modules/event/services/event-write-service";
import { listManagedEvents, resolvePolicyActor } from "@/modules/event/services/event-list-service";
import type { DispatchResult } from "@/modules/refund/refund.types";
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
 * session and the `organizer` row; the policy decision is the service's. The
 * callback also gets the signed-in `user.id` (never taken from the input).
 * On success records `audit` (a function of the result's data when the id is
 * new). Failures are logged and answered with a generic message.
 */
async function run<T = void>(
  name: string,
  mutation: (actor: PolicyActor, userId: string) => Promise<EventActionResult<T>>,
  audit: AuditEntry | ((data: T) => AuditEntry),
): Promise<EventActionResult<T>> {
  const user = await requireRole("organizer");
  try {
    const result = await mutation(await resolvePolicyActor(user), user.id);
    if (result.ok) {
      revalidatePath("/organizer");
      revalidatePath("/");
      await recordAudit(typeof audit === "function" ? audit(result.data) : audit);
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
  return run(
    "createEventAction",
    (actor) => createEvent(actor, parsed.data, organizerId),
    (data) => ({
      action: "event.create",
      targetType: "event",
      targetId: data.id,
      metadata: organizerId ? { organizerId } : undefined,
    }),
  );
}

/** `input` is `{ id, ...form values }`. */
export async function updateEventAction(input: unknown): Promise<EventActionResult> {
  const id = eventIdSchema.safeParse(input);
  const values = draftSchema.safeParse(input);
  if (!id.success) return { ok: false, error: INVALID_MESSAGE };
  if (!values.success) return { ok: false, error: values.error.issues[0]?.message ?? INVALID_MESSAGE };
  return run("updateEventAction", (actor) => updateEvent(actor, id.data.id, values.data), {
    action: "event.update",
    targetType: "event",
    targetId: id.data.id,
  });
}

export async function deleteEventAction(input: unknown): Promise<EventActionResult> {
  const parsed = eventIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID_MESSAGE };
  return run("deleteEventAction", (actor) => deleteEvent(actor, parsed.data.id), {
    action: "event.delete",
    targetType: "event",
    targetId: parsed.data.id,
  });
}

/** Publish, unpublish or cancel. The single door for status changes. */
export async function setEventStatusAction(input: unknown): Promise<EventActionResult> {
  const parsed = setStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID_MESSAGE };
  const { id, status } = parsed.data;
  return run("setEventStatusAction", (actor, userId) => setEventStatus(actor, id, status, userId), {
    action: "event.set_status",
    targetType: "event",
    targetId: id,
    metadata: { status },
  });
}

/** Re-sends the pending refunds of a cancelled event. Whether the actor may is the service's call. */
export async function retryEventRefundsAction(input: unknown): Promise<EventActionResult<DispatchResult>> {
  const parsed = eventIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID_MESSAGE };
  return run("retryEventRefundsAction", (actor, userId) => retryEventRefunds(actor, userId, parsed.data.id), {
    action: "event.retry_refunds",
    targetType: "event",
    targetId: parsed.data.id,
  });
}

/** Presigned upload for a new cover; the browser posts the file straight to S3. */
export async function createCoverUploadAction(input: unknown): Promise<EventActionResult<CoverUpload>> {
  await requireRole("organizer");
  const parsed = coverUploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Usa una imagen JPG, PNG o WebP." };

  const { contentType } = parsed.data;
  try {
    const data = await createCoverUpload(contentType);
    // Never the presigned URL: only what was asked for.
    await recordAudit({ action: "event.create_cover_upload", metadata: { contentType } });
    return { ok: true, data };
  } catch (error) {
    console.error("createCoverUploadAction", error);
    return { ok: false, error: "No pudimos preparar la subida. Intenta de nuevo." };
  }
}

/** Marks or unmarks the event as featured on the landing. Whether the actor is a moderator is the service's call. */
export async function setEventFeaturedAction(input: unknown): Promise<EventActionResult> {
  const parsed = setFeaturedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID_MESSAGE };
  const { id, featured } = parsed.data;
  return run("setEventFeaturedAction", (actor) => setEventFeatured(actor, id, featured), {
    action: "event.set_featured",
    targetType: "event",
    targetId: id,
    metadata: { featured },
  });
}
