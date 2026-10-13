import type {
  EditableFields,
  EventCapabilities,
  EventFacts,
  EventZoneInput,
  PolicyActor,
  PolicyEvent,
  PublishBlocker,
  PublishOrganizer,
  PublishZone,
  ZoneChangeError,
  ZoneChangeErrorCode,
  ZoneState,
} from "@/modules/event/event-write.types";
import { can } from "@/modules/user/user.permissions";

/**
 * Who may do what with an event. Pure: `now` and the sales `facts` are passed
 * in, so the same rules serve the services (the real gate, with facts read
 * right before writing), the list capabilities and the UI (which only hides).
 *
 * Roles: `customer` nothing; `organizer` only events of their own `organizer`
 * row; `admin`/`super_admin` (`event:moderate`) any event; they create on behalf
 * of an organizer (`createEvent` takes the owner) but never publish, and only
 * they feature events on the landing.
 */

export const PUBLISH_BLOCKER_MESSAGES: Record<PublishBlocker, string> = {
  organizer_not_approved: "Tu perfil de organizador debe estar aprobado para publicar.",
  connect_incomplete: "Configura tus pagos en Stripe para poder publicar eventos.",
  no_zones: "Agrega al menos una zona con precio.",
  zone_without_price: "Cada zona a la venta necesita un precio mayor que 0.",
  zone_without_capacity: "Cada zona de pie necesita una capacidad mayor que 0.",
  starts_in_past: "La fecha del evento debe ser futura.",
};

export const ZONE_CHANGE_MESSAGES: Record<ZoneChangeErrorCode, string> = {
  price_locked: "El precio de una zona con entradas vendidas o reservadas no se puede cambiar.",
  zone_in_use: "No se puede quitar una zona con entradas vendidas o reservadas.",
  capacity_below_occupied: "La capacidad no puede ser menor que las entradas vendidas o reservadas.",
};

const isModerator = (actor: PolicyActor) => can(actor.role, "event:moderate");

const isOwner = (actor: PolicyActor, event: PolicyEvent) =>
  actor.role === "organizer" && actor.organizerId !== null && actor.organizerId === event.organizerId;

/** An owner whose organizer profile is not approved can only work on drafts. */
const ownerMayWrite = (actor: PolicyActor, event: PolicyEvent) =>
  actor.organizerStatus === "approved" || event.status === "draft";

/** Cancelled, finished or already started: nothing about it can change (except deleting it, see `canDeleteEvent`). */
export function isEventReadOnly(event: PolicyEvent, now: Date): boolean {
  return event.status === "cancelled" || event.status === "finished" || event.startsAt <= now;
}

/** Organizers (with a profile) create their own; admins create for an organizer they pick. */
export function canCreateEvent(actor: PolicyActor): boolean {
  return (actor.role === "organizer" && actor.organizerId !== null) || isModerator(actor);
}

export function canViewEvent(actor: PolicyActor, event: PolicyEvent): boolean {
  return isModerator(actor) || isOwner(actor, event);
}

export function canEditEvent(actor: PolicyActor, event: PolicyEvent, now: Date): boolean {
  if (isEventReadOnly(event, now)) return false;
  return isModerator(actor) || (isOwner(actor, event) && ownerMayWrite(actor, event));
}

/** The organizer side of publishing: approved profile and Stripe Connect onboarding complete. */
export function canOrganizerPublish(actor: PolicyActor): boolean {
  return actor.organizerStatus === "approved" && actor.stripeOnboardingStatus === "complete";
}

/** The organizer slice `getPublishBlockers` checks, taken from the actor. */
export const toPublishOrganizer = (actor: PolicyActor): PublishOrganizer => ({
  status: actor.organizerStatus,
  stripeOnboardingStatus: actor.stripeOnboardingStatus,
});

/** Only the approved owner with Connect complete publishes, and only a draft that has nothing left to fix. */
export function canPublishEvent(actor: PolicyActor, event: PolicyEvent, zones: PublishZone[], now: Date): boolean {
  return (
    isOwner(actor, event) &&
    event.status === "draft" &&
    !isEventReadOnly(event, now) &&
    getPublishBlockers({ startsAt: event.startsAt, zones, organizer: toPublishOrganizer(actor) }, now).length === 0
  );
}

export function canUnpublishEvent(actor: PolicyActor, event: PolicyEvent, facts: EventFacts, now: Date): boolean {
  if (event.status !== "published" || isEventReadOnly(event, now)) return false;
  if (isModerator(actor)) return true;
  return isOwner(actor, event) && actor.organizerStatus === "approved" && !facts.hasSales;
}

export function canCancelEvent(actor: PolicyActor, event: PolicyEvent, facts: EventFacts, now: Date): boolean {
  if (isEventReadOnly(event, now)) return false;
  if (event.status !== "published" && !(event.status === "draft" && facts.hasOrders)) return false;
  if (isModerator(actor)) return true;
  return isOwner(actor, event) && actor.organizerStatus === "approved";
}

/** Hard delete: only without orders or reservations, even if the event is past or cancelled. */
export function canDeleteEvent(actor: PolicyActor, event: PolicyEvent, facts: EventFacts): boolean {
  if (facts.hasOrders) return false;
  return isModerator(actor) || (isOwner(actor, event) && ownerMayWrite(actor, event));
}

/** Moderation only, never the owner; a draft can be featured ahead of publishing (the Hero only shows published, upcoming ones). */
export function canFeatureEvent(actor: PolicyActor, event: PolicyEvent, now: Date): boolean {
  return isModerator(actor) && !isEventReadOnly(event, now);
}

/** Date and venue are locked once there are sales; everything is locked when the event is read-only. */
export function editableFields(event: PolicyEvent, facts: EventFacts, now: Date): EditableFields {
  const open = !isEventReadOnly(event, now);
  const unlocked = open && !facts.hasSales;
  return {
    title: open,
    description: open,
    coverImageUrl: open,
    categoryId: open,
    startsAt: unlocked,
    venueId: unlocked,
  };
}

export function getEventCapabilities(
  actor: PolicyActor,
  event: PolicyEvent,
  facts: EventFacts,
  zones: PublishZone[],
  now: Date,
): EventCapabilities {
  return {
    edit: canEditEvent(actor, event, now),
    publish: canPublishEvent(actor, event, zones, now),
    unpublish: canUnpublishEvent(actor, event, facts, now),
    cancel: canCancelEvent(actor, event, facts, now),
    delete: canDeleteEvent(actor, event, facts),
    feature: canFeatureEvent(actor, event, now),
  };
}

/**
 * What a zone edit breaks, by venue zone. Only occupied zones (sold or held)
 * are protected: they keep their price, cannot be removed and a general-admission
 * capacity cannot drop below the occupancy. New and free zones change freely.
 */
export function checkZoneChanges(currentZones: ZoneState[], nextZones: EventZoneInput[]): ZoneChangeError[] {
  const next = new Map(nextZones.map((zone) => [zone.venueZoneId, zone]));
  const errors: ZoneChangeError[] = [];

  for (const current of currentZones) {
    if (current.occupied <= 0) continue;

    const updated = next.get(current.venueZoneId);
    if (!updated) {
      errors.push({ venueZoneId: current.venueZoneId, code: "zone_in_use" });
      continue;
    }
    if (updated.priceCents !== current.priceCents) {
      errors.push({ venueZoneId: current.venueZoneId, code: "price_locked" });
    }
    if (current.seatingType === "general_admission" && (updated.capacity ?? 0) < current.occupied) {
      errors.push({ venueZoneId: current.venueZoneId, code: "capacity_below_occupied" });
    }
  }
  return errors;
}

/**
 * Why an event cannot be published yet (empty = ready). With `organizer` it also
 * checks the organizer (approved, Connect complete), first; without it only the
 * event: editing an already published event does not depend on Connect.
 */
export function getPublishBlockers(
  snapshot: { startsAt: Date; zones: PublishZone[]; organizer?: PublishOrganizer },
  now: Date,
): PublishBlocker[] {
  const { startsAt, zones, organizer } = snapshot;
  const blockers: PublishBlocker[] = [];

  if (organizer) {
    if (organizer.status !== "approved") blockers.push("organizer_not_approved");
    if (organizer.stripeOnboardingStatus !== "complete") blockers.push("connect_incomplete");
  }
  if (zones.length === 0) blockers.push("no_zones");
  if (zones.some((zone) => zone.priceCents <= 0)) blockers.push("zone_without_price");
  if (zones.some((zone) => zone.seatingType === "general_admission" && (zone.capacity ?? 0) <= 0)) {
    blockers.push("zone_without_capacity");
  }
  if (startsAt <= now) blockers.push("starts_in_past");
  return blockers;
}
