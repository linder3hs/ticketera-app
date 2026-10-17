import { and, eq, gt, like, or, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { db } from "@/db";
import { category, event, eventSeat, eventZone, orderItem, organizer, reservationItem, venue, venueSeat, venueZone } from "@/db/schema";
import { pgErrorCode } from "@/lib/pg-error";
import { escapeLike, slugify } from "@/lib/utils";
import type { EventStatus } from "@/modules/event/event-list.types";
import type {
  EventActionResult,
  EventFacts,
  EventWriteInput,
  PolicyActor,
  PolicyEvent,
  SeatingType,
  ZoneState,
} from "@/modules/event/event-write.types";
import { nextAvailableSlug, sameMinute } from "@/modules/event/event-write.utils";
import {
  PUBLISH_BLOCKER_MESSAGES,
  ZONE_CHANGE_MESSAGES,
  canCancelEvent,
  canCreateEvent,
  canDeleteEvent,
  canEditEvent,
  canFeatureEvent,
  canPublishEvent,
  canUnpublishEvent,
  canViewEvent,
  checkZoneChanges,
  editableFields,
  getPublishBlockers,
  isEventReadOnly,
  toPublishOrganizer,
} from "@/modules/event/event.policy";
import {
  eventHasOrders,
  eventHasSales,
  gaOccupancy,
  getEventFacts,
  getZoneStates,
  seatedOccupancy,
} from "@/modules/event/services/event-facts-service";
import type { DispatchResult } from "@/modules/refund/refund.types";
import { canRetryEventRefunds } from "@/modules/refund/refund.utils";
import { cancelEventAndRefund, retryEventRefunds as retryRefunds } from "@/modules/refund/services/refund-service";
import { can } from "@/modules/user/user.permissions";

/**
 * Event writes. `db` has no interactive transactions (`db.batch` is one transaction), so: create is
 * one atomic `db.batch`; every statement that depends on sales carries its
 * guard in the `WHERE`; status changes are compare-and-set. The decision comes
 * from the pure policy with facts read right before writing. See the spec's
 * "Concurrencia". User-facing errors are generic Spanish; details go to
 * `console.error`.
 */

const MESSAGES = {
  notFound: "No encontramos el evento.",
  forbidden: "No tienes permiso para realizar esta acción.",
  generic: "No pudimos guardar los cambios. Intenta de nuevo.",
  salesChanged: "Las ventas cambiaron: recarga e intenta de nuevo",
  hasOrders: "Tiene ventas: cancélalo",
  readOnly: "Este evento ya no se puede modificar.",
  noProfile: "Completa tu perfil de organizador.",
  organizerRequired: "Elige el organizador del evento.",
  organizerMissing: "El organizador elegido no existe.",
  pastDate: "La fecha y hora deben ser futuras.",
  dateLocked: "La fecha no se puede cambiar: el evento tiene ventas.",
  venueLocked: "El recinto no se puede cambiar: el evento tiene ventas.",
  categoryMissing: "La categoría elegida no existe.",
  venueMissing: "El recinto elegido no existe.",
  zoneOutsideVenue: "Una de las zonas no pertenece al recinto elegido.",
  zoneHasHistory: "No se puede quitar una zona con reservas u órdenes registradas.",
  venueHasHistory: "No se puede cambiar el recinto: el evento tiene reservas u órdenes registradas.",
  onlyOwnerPublishes: "Solo el organizador del evento puede publicarlo.",
  notApproved: "Tu perfil de organizador aún no está aprobado: solo puedes guardar borradores.",
  onlyDraftPublishes: "Solo un borrador se puede publicar.",
  onlyPublishedUnpublishes: "Solo un evento publicado se puede despublicar.",
  hasSalesUnpublish: "Tiene ventas: solo un administrador puede despublicarlo.",
  notCancellable: "Solo se puede cancelar un evento publicado (o un borrador con órdenes).",
  notCancelled: "Solo se pueden reintentar los reembolsos de un evento cancelado.",
} as const;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** Logs the detail and answers with a message that exposes nothing; a tripped capacity CHECK means sales moved in. */
function failed(context: string, error: unknown): { ok: false; error: string } {
  console.error(context, error);
  return fail(pgErrorCode(error) === "23514" ? MESSAGES.salesChanged : MESSAGES.generic);
}

const isModerator = (actor: PolicyActor) => can(actor.role, "event:moderate");

/** Defence in depth: a non-moderator only ever writes rows of their own organizer. */
const ownerGuard = (actor: PolicyActor): SQL | undefined =>
  isModerator(actor) || actor.organizerId === null ? undefined : eq(event.organizerId, actor.organizerId);

interface StoredEvent extends PolicyEvent {
  id: string;
  venueId: string;
}

/** The event only if it exists and `actor` may see it; absent and forbidden look the same. */
async function loadVisibleEvent(actor: PolicyActor, eventId: string): Promise<StoredEvent | undefined> {
  const [row] = await db
    .select({ id: event.id, organizerId: event.organizerId, venueId: event.venueId, status: event.status, startsAt: event.startsAt })
    .from(event)
    .where(eq(event.id, eventId));
  return row && canViewEvent(actor, row) ? row : undefined;
}

async function loadFacts(eventId: string): Promise<EventFacts> {
  return (await getEventFacts([eventId])).get(eventId) ?? { hasSales: false, hasOrders: false };
}

/** A batch whose guarded statements must each affect exactly one row. */
function createBatch() {
  const queries: BatchItem<"pg">[] = [];
  const guarded: number[] = [];

  const affected = (result: unknown): number => {
    if (Array.isArray(result)) return result.length;
    return (result as { rowCount?: number | null } | undefined)?.rowCount ?? 0;
  };

  return {
    add(query: BatchItem<"pg">) {
      queries.push(query);
    },
    addGuarded(query: BatchItem<"pg">) {
      guarded.push(queries.length);
      queries.push(query);
    },
    /** `false` when some guard did not apply (sales changed in between). The driver throws if a statement fails. */
    async run(): Promise<boolean> {
      if (queries.length === 0) return true;
      const results = (await db.batch(queries as [BatchItem<"pg">, ...BatchItem<"pg">[]])) as unknown[];
      return guarded.every((index) => affected(results[index]) === 1);
    },
  };
}

type Batch = ReturnType<typeof createBatch>;

/** A zone of the form checked against its venue zone. */
interface ResolvedZone {
  venueZoneId: string;
  name: string;
  seatingType: SeatingType;
  priceCents: number;
  /** `null` for numbered zones (their capacity is their seats). */
  capacity: number | null;
}

/**
 * Reads only: category and venue exist, every zone belongs to the venue, GA
 * capacity is within 1..venue capacity, numbered zones ignore capacity.
 */
async function resolveReferences(
  input: EventWriteInput,
  venueId: string,
): Promise<{ ok: true; zones: ResolvedZone[] } | { ok: false; error: string }> {
  const [categories, venues, venueZones] = await Promise.all([
    db.select({ id: category.id }).from(category).where(eq(category.id, input.categoryId)).limit(1),
    db.select({ id: venue.id }).from(venue).where(eq(venue.id, venueId)).limit(1),
    db
      .select({ id: venueZone.id, name: venueZone.name, seatingType: venueZone.seatingType, capacity: venueZone.capacity })
      .from(venueZone)
      .where(eq(venueZone.venueId, venueId)),
  ]);
  if (categories.length === 0) return fail(MESSAGES.categoryMissing);
  if (venues.length === 0) return fail(MESSAGES.venueMissing);

  const byId = new Map(venueZones.map((zone) => [zone.id, zone]));
  const zones: ResolvedZone[] = [];
  for (const zone of input.zones) {
    const stored = byId.get(zone.venueZoneId);
    if (!stored) return fail(MESSAGES.zoneOutsideVenue);

    if (stored.seatingType === "numbered") {
      zones.push({ venueZoneId: stored.id, name: stored.name, seatingType: "numbered", priceCents: zone.priceCents, capacity: null });
      continue;
    }

    const { capacity } = zone;
    if (capacity === null || capacity < 1 || (stored.capacity !== null && capacity > stored.capacity)) {
      const upTo = stored.capacity === null ? "" : ` y ${stored.capacity}`;
      return fail(`La capacidad de "${stored.name}" debe estar entre 1${upTo}.`);
    }
    zones.push({ venueZoneId: stored.id, name: stored.name, seatingType: "general_admission", priceCents: zone.priceCents, capacity });
  }
  return { ok: true, zones };
}

/** The event is still in `venueId`; chains the zone statements to the venue update so they no-op if it did not apply. */
const eventInVenue = (eventId: string, venueId: string) =>
  sql`exists (select 1 from ${event} where ${event.id} = ${eventId} and ${event.venueId} = ${venueId})`;

const occupancyOf = (seatingType: SeatingType) => (seatingType === "general_admission" ? gaOccupancy : seatedOccupancy);

/** Inserts an `event_zone` (guarded by the event still being in the venue) and, if numbered, its `event_seat` rows from `venue_seat`. */
function addZoneStatements(batch: Batch, eventId: string, venueId: string, zone: ResolvedZone) {
  const zoneId = crypto.randomUUID();
  batch.addGuarded(
    db.execute(
      sql`insert into ${eventZone} (id, event_id, venue_zone_id, name, price_cents, capacity) select ${zoneId}::uuid, ${eventId}::uuid, ${zone.venueZoneId}::uuid, ${zone.name}::text, ${zone.priceCents}::integer, ${zone.capacity}::integer where ${eventInVenue(eventId, venueId)}`,
    ),
  );
  if (zone.seatingType === "numbered") {
    batch.add(
      db.execute(
        sql`insert into ${eventSeat} (event_zone_id, venue_seat_id) select ${zoneId}::uuid, ${venueSeat.id} from ${venueSeat} where ${venueSeat.venueZoneId} = ${zone.venueZoneId} and exists (select 1 from ${eventZone} where ${eventZone.id} = ${zoneId})`,
      ),
    );
  }
}

/**
 * New events are always drafts. An organizer owns theirs (their `organizer` row, from the session, never from input);
 * an admin passes `requestedOrganizerId`, which must be an existing organizer.
 */
export async function createEvent(
  actor: PolicyActor,
  input: EventWriteInput,
  requestedOrganizerId?: string,
): Promise<EventActionResult<{ id: string }>> {
  if (!canCreateEvent(actor)) {
    return fail(actor.role === "organizer" ? MESSAGES.noProfile : MESSAGES.forbidden);
  }
  const organizerId = actor.role === "organizer" ? actor.organizerId : (requestedOrganizerId ?? null);
  if (organizerId === null) return fail(MESSAGES.organizerRequired);

  try {
    if (actor.role !== "organizer") {
      const [owner] = await db.select({ id: organizer.id }).from(organizer).where(eq(organizer.id, organizerId));
      if (!owner) return fail(MESSAGES.organizerMissing);
    }
    if (input.startsAt <= new Date()) return fail(MESSAGES.pastDate);
    const references = await resolveReferences(input, input.venueId);
    if (!references.ok) return references;

    const base = slugify(input.title) || "event";
    const eventId = crypto.randomUUID();

    // The slug is unique in the DB: if a concurrent create takes it first, re-read and try once more.
    for (let attempt = 1; ; attempt += 1) {
      const taken = await db
        .select({ slug: event.slug })
        .from(event)
        .where(or(eq(event.slug, base), like(event.slug, `${escapeLike(base)}-%`)));

      const batch = createBatch();
      batch.addGuarded(
        db
          .insert(event)
          .values({
            id: eventId,
            organizerId,
            venueId: input.venueId,
            categoryId: input.categoryId,
            title: input.title,
            slug: nextAvailableSlug(base, taken.map((row) => row.slug)),
            description: input.description,
            coverImageUrl: input.coverImageUrl,
            startsAt: input.startsAt,
          })
          .returning({ id: event.id }),
      );
      for (const zone of references.zones) addZoneStatements(batch, eventId, input.venueId, zone);

      try {
        if (!(await batch.run())) return fail(MESSAGES.generic);
        return { ok: true, data: { id: eventId } };
      } catch (error) {
        if (pgErrorCode(error) !== "23505" || attempt >= 2) throw error;
      }
    }
  } catch (error) {
    return failed("createEvent", error);
  }
}

/** Event zones that have reservation or order lines (even released or failed ones): their FKs forbid deleting them. */
async function listZonesWithHistory(eventId: string): Promise<Set<string>> {
  const rows = await db
    .select({ venueZoneId: eventZone.venueZoneId })
    .from(eventZone)
    .where(
      and(
        eq(eventZone.eventId, eventId),
        sql`(exists (select 1 from ${orderItem} where ${orderItem.eventZoneId} = ${eventZone.id}) or exists (select 1 from ${reservationItem} where ${reservationItem.eventZoneId} = ${eventZone.id}))`,
      ),
    );
  return new Set(rows.map((row) => row.venueZoneId));
}

/** Queues the zone changes: remove the missing, update the changed (guarded by occupancy), add the new. */
function queueZoneChanges(
  batch: Batch,
  eventId: string,
  venueId: string,
  venueChanged: boolean,
  current: ZoneState[],
  next: ResolvedZone[],
) {
  const nextById = new Map(next.map((zone) => [zone.venueZoneId, zone]));
  const currentById = new Map(current.map((zone) => [zone.venueZoneId, zone]));
  const chain = venueChanged ? eventInVenue(eventId, venueId) : undefined;

  for (const zone of current) {
    const target = venueChanged ? undefined : nextById.get(zone.venueZoneId);
    const where = [eq(eventZone.eventId, eventId), eq(eventZone.venueZoneId, zone.venueZoneId)];

    if (!target) {
      batch.addGuarded(
        db
          .delete(eventZone)
          .where(and(...where, chain, sql`${occupancyOf(zone.seatingType)} = 0`))
          .returning({ id: eventZone.id }),
      );
      continue;
    }

    const priceChanged = target.priceCents !== zone.priceCents;
    const capacityChanged = target.capacity !== zone.capacity;
    if (!priceChanged && !capacityChanged) continue;

    batch.addGuarded(
      db
        .update(eventZone)
        .set({ priceCents: target.priceCents, capacity: target.capacity })
        .where(
          and(
            ...where,
            priceChanged ? sql`${occupancyOf(zone.seatingType)} = 0` : undefined,
            capacityChanged && target.capacity !== null ? sql`${gaOccupancy} <= ${target.capacity}` : undefined,
          ),
        )
        .returning({ id: eventZone.id }),
    );
  }

  for (const zone of next) {
    if (venueChanged || !currentById.has(zone.venueZoneId)) addZoneStatements(batch, eventId, venueId, zone);
  }
}

export async function updateEvent(actor: PolicyActor, eventId: string, input: EventWriteInput): Promise<EventActionResult> {
  try {
    const stored = await loadVisibleEvent(actor, eventId);
    if (!stored) return fail(MESSAGES.notFound);

    const now = new Date();
    if (isEventReadOnly(stored, now)) return fail(MESSAGES.readOnly);
    if (!canEditEvent(actor, stored, now)) return fail(MESSAGES.forbidden);

    const [facts, currentZones] = await Promise.all([loadFacts(eventId), getZoneStates(eventId)]);
    const editable = editableFields(stored, facts, now);

    // Locked fields keep their stored value; a different one is rejected rather than ignored.
    const startsAtChanged = !sameMinute(input.startsAt, stored.startsAt);
    const venueChanged = input.venueId !== stored.venueId;
    if (startsAtChanged && !editable.startsAt) return fail(MESSAGES.dateLocked);
    if (venueChanged && !editable.venueId) return fail(MESSAGES.venueLocked);
    if (startsAtChanged && input.startsAt <= now) return fail(MESSAGES.pastDate);

    const venueId = venueChanged ? input.venueId : stored.venueId;
    const references = await resolveReferences(input, venueId);
    if (!references.ok) return references;

    if (!venueChanged) {
      const zoneErrors = checkZoneChanges(currentZones, input.zones);
      if (zoneErrors.length > 0) return fail(ZONE_CHANGE_MESSAGES[zoneErrors[0].code]);
    }

    if (stored.status === "published") {
      const startsAt = startsAtChanged ? input.startsAt : stored.startsAt;
      const [blocker] = getPublishBlockers({ startsAt, zones: references.zones }, now);
      if (blocker) return fail(PUBLISH_BLOCKER_MESSAGES[blocker]);
    }

    const removed = venueChanged
      ? currentZones
      : currentZones.filter((zone) => !references.zones.some((next) => next.venueZoneId === zone.venueZoneId));
    if (removed.length > 0) {
      const withHistory = await listZonesWithHistory(eventId);
      if (removed.some((zone) => withHistory.has(zone.venueZoneId))) {
        return fail(venueChanged ? MESSAGES.venueHasHistory : MESSAGES.zoneHasHistory);
      }
    }

    const batch = createBatch();
    batch.addGuarded(
      db
        .update(event)
        .set({
          title: input.title,
          description: input.description,
          categoryId: input.categoryId,
          coverImageUrl: input.coverImageUrl,
          ...(startsAtChanged ? { startsAt: input.startsAt } : {}),
          ...(venueChanged ? { venueId } : {}),
        })
        .where(
          and(
            eq(event.id, eventId),
            eq(event.status, stored.status),
            gt(event.startsAt, now),
            ownerGuard(actor),
            startsAtChanged || venueChanged ? sql`not ${eventHasSales(event.id)}` : undefined,
          ),
        )
        .returning({ id: event.id }),
    );
    queueZoneChanges(batch, eventId, venueId, venueChanged, currentZones, references.zones);

    return (await batch.run()) ? { ok: true, data: undefined } : fail(MESSAGES.salesChanged);
  } catch (error) {
    return failed("updateEvent", error);
  }
}

export async function deleteEvent(actor: PolicyActor, eventId: string): Promise<EventActionResult> {
  try {
    const stored = await loadVisibleEvent(actor, eventId);
    if (!stored) return fail(MESSAGES.notFound);

    const facts = await loadFacts(eventId);
    if (!canDeleteEvent(actor, stored, facts)) return fail(facts.hasOrders ? MESSAGES.hasOrders : MESSAGES.forbidden);

    // Zones and seats go with it (cascade); orders and reservations have no cascade, so the guard is the rule.
    const deleted = await db
      .delete(event)
      .where(and(eq(event.id, eventId), ownerGuard(actor), sql`not ${eventHasOrders(event.id)}`))
      .returning({ id: event.id });

    return deleted.length === 1 ? { ok: true, data: undefined } : fail(MESSAGES.hasOrders);
  } catch (error) {
    return failed("deleteEvent", error);
  }
}

/**
 * Marks or unmarks the event as featured on the landing (moderators only). No
 * extra guard in the `WHERE`: if the event is cancelled in between, the flag
 * stays on an event the Hero already filters out.
 */
export async function setEventFeatured(actor: PolicyActor, eventId: string, featured: boolean): Promise<EventActionResult> {
  try {
    const stored = await loadVisibleEvent(actor, eventId);
    if (!stored) return fail(MESSAGES.notFound);

    const now = new Date();
    if (isEventReadOnly(stored, now)) return fail(MESSAGES.readOnly);
    if (!canFeatureEvent(actor, stored, now)) return fail(MESSAGES.forbidden);

    const updated = await db.update(event).set({ featured }).where(eq(event.id, eventId)).returning({ id: event.id });
    return updated.length === 1 ? { ok: true, data: undefined } : fail(MESSAGES.notFound);
  } catch (error) {
    return failed("setEventFeatured", error);
  }
}

/** Why `actor` cannot move `stored` to `status` (`null` when they can). */
function statusDenial(
  actor: PolicyActor,
  stored: StoredEvent,
  zones: ZoneState[],
  facts: EventFacts,
  status: "published" | "draft" | "cancelled",
  now: Date,
): string | null {
  if (status === "published") {
    if (canPublishEvent(actor, stored, zones, now)) return null;
    if (actor.role !== "organizer" || actor.organizerId !== stored.organizerId) return MESSAGES.onlyOwnerPublishes;
    if (actor.organizerStatus !== "approved") return MESSAGES.notApproved;
    if (stored.status !== "draft") return MESSAGES.onlyDraftPublishes;
    if (isEventReadOnly(stored, now)) return MESSAGES.readOnly;
    const [blocker] = getPublishBlockers(
      { startsAt: stored.startsAt, zones, organizer: toPublishOrganizer(actor) },
      now,
    );
    return blocker ? PUBLISH_BLOCKER_MESSAGES[blocker] : MESSAGES.forbidden;
  }

  if (status === "draft") {
    if (canUnpublishEvent(actor, stored, facts, now)) return null;
    if (stored.status !== "published") return MESSAGES.onlyPublishedUnpublishes;
    if (isEventReadOnly(stored, now)) return MESSAGES.readOnly;
    return facts.hasSales ? MESSAGES.hasSalesUnpublish : MESSAGES.forbidden;
  }

  if (canCancelEvent(actor, stored, facts, now)) return null;
  if (isEventReadOnly(stored, now)) return MESSAGES.readOnly;
  const cancellable = stored.status === "published" || (stored.status === "draft" && facts.hasOrders);
  return cancellable ? MESSAGES.forbidden : MESSAGES.notCancellable;
}

/**
 * Publish (`draft` → `published`), unpublish (→ `draft`) or cancel (→ `cancelled`), as a compare-and-set on the previous status.
 * Cancelling also creates and sends the refunds (`cancelEventAndRefund`): the compare-and-set built here runs
 * first in the refund batch, and a Stripe failure afterwards does not undo the cancellation. `userId` is the
 * signed-in user (from the session), recorded as who requested the refunds.
 */
export async function setEventStatus(
  actor: PolicyActor,
  eventId: string,
  status: "published" | "draft" | "cancelled",
  userId: string,
): Promise<EventActionResult> {
  try {
    const stored = await loadVisibleEvent(actor, eventId);
    if (!stored) return fail(MESSAGES.notFound);

    const [facts, zones] = await Promise.all([loadFacts(eventId), getZoneStates(eventId)]);
    const now = new Date();
    const denial = statusDenial(actor, stored, zones, facts, status, now);
    if (denial) return fail(denial);

    const previous: EventStatus = stored.status;
    const unpublishWithoutSales = status === "draft" && !isModerator(actor);
    const compareAndSet = db
      .update(event)
      .set({ status })
      .where(
        and(
          eq(event.id, eventId),
          eq(event.status, previous),
          gt(event.startsAt, now),
          ownerGuard(actor),
          status === "published"
            ? sql`exists (select 1 from ${eventZone} where ${eventZone.eventId} = ${event.id} and ${eventZone.priceCents} > 0) and exists (select 1 from ${organizer} where ${organizer.id} = ${event.organizerId} and ${organizer.status} = 'approved' and ${organizer.stripeOnboardingStatus} = 'complete')`
            : undefined,
          unpublishWithoutSales ? sql`not ${eventHasSales(event.id)}` : undefined,
        ),
      )
      .returning({ id: event.id });

    if (status === "cancelled") {
      // The statement goes unexecuted: the refund batch runs it together with the refunds and the tickets.
      const cancelled = await cancelEventAndRefund(compareAndSet, eventId, userId);
      return cancelled.ok ? { ok: true, data: undefined } : fail(MESSAGES.salesChanged);
    }

    const updated = await compareAndSet;
    if (updated.length === 1) return { ok: true, data: undefined };
    return fail(MESSAGES.salesChanged);
  } catch (error) {
    return failed("setEventStatus", error);
  }
}

/**
 * Retries the refunds of a cancelled event: sends the pending ones to Stripe and creates new ones where the
 * last attempt failed or was cancelled. The data says how many went out and how many are still pending
 * (all zeros when there was nothing to do). `userId` comes from the session.
 */
export async function retryEventRefunds(
  actor: PolicyActor,
  userId: string,
  eventId: string,
): Promise<EventActionResult<DispatchResult>> {
  try {
    const stored = await loadVisibleEvent(actor, eventId);
    if (!stored) return fail(MESSAGES.notFound);
    if (!canRetryEventRefunds(actor, stored)) {
      return fail(stored.status === "cancelled" ? MESSAGES.forbidden : MESSAGES.notCancelled);
    }

    return { ok: true, data: await retryRefunds(eventId, userId) };
  } catch (error) {
    return failed("retryEventRefunds", error);
  }
}
