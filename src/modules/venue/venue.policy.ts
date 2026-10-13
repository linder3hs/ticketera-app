import { can } from "@/modules/user/user.permissions";
import type {
  PolicyVenue,
  VenueActor,
  VenueCapabilities,
  VenueFacts,
  VenueOwner,
  VenueZoneChangeError,
  ZoneCapabilities,
  ZoneChangeState,
  ZoneFacts,
} from "@/modules/venue/venue.types";

/**
 * Who may do what with a venue. Pure: the `facts` are passed in, so the same
 * rules serve the write services (the real gate, facts read right before
 * writing), the list/detail capabilities and the UI (which only hides).
 *
 * Roles: `customer` nothing; `organizer` creates and edits only the venues
 * they created; `admin`/`super_admin` (`venue:moderate`) any venue, including
 * the seeded ones (`createdBy = null`). Everyone from `organizer` up can see
 * and use every venue; only editing is restricted.
 */

export const VENUE_MESSAGES = {
  forbidden: "No tienes permiso para modificar recintos.",
  platform_venue: "Solo un admin edita recintos de la plataforma.",
  other_owner: "Solo quien creó el recinto o un admin puede modificarlo.",
  has_sales: "El recinto tiene entradas vendidas: zonas y asientos no se pueden modificar.",
  venue_in_use: "Lo usa un evento: no se puede borrar.",
  zone_in_use: "Lo usa un evento: la zona no se puede borrar, cambiar de tipo ni regenerar sus asientos.",
  sales_changed: "Las ventas cambiaron: recarga e intenta de nuevo.",
} as const;

export const ZONE_CHANGE_MESSAGES: Record<VenueZoneChangeError, string> = {
  type_locked: "Lo usa un evento: el tipo de zona no se puede cambiar.",
  capacity_below_in_use: "La capacidad no puede ser menor que la de un evento que usa la zona.",
};

const isModerator = (actor: VenueActor) => can(actor.role, "venue:moderate");

const isOwner = (actor: VenueActor, venue: PolicyVenue) =>
  can(actor.role, "venue:manage-own") && venue.createdBy !== null && venue.createdBy === actor.id;

export function canCreateVenue(actor: VenueActor): boolean {
  return can(actor.role, "venue:manage-own");
}

/** Basic data (name, address, city, lat/lng): moderators any venue, organizers their own. Sales do not matter here. */
export function canEditVenue(actor: VenueActor, venue: PolicyVenue): boolean {
  return isModerator(actor) || isOwner(actor, venue);
}

/** Hard delete: editors only, and never while an event (any status) uses the venue. */
export function canDeleteVenue(actor: VenueActor, venue: PolicyVenue, facts: VenueFacts): boolean {
  return canEditVenue(actor, venue) && !facts.isReferenced;
}

/** Create, edit, delete zones and generate seats: editors only, and read-only once there are sales. */
export function canEditZones(actor: VenueActor, venue: PolicyVenue, facts: VenueFacts): boolean {
  return canEditVenue(actor, venue) && !facts.hasSales;
}

/** A zone an event uses keeps its type and seats and cannot be deleted; its capacity never drops below what events took. */
export function getZoneCapabilities(zoneFacts: ZoneFacts): ZoneCapabilities {
  const free = !zoneFacts.isReferenced;
  return { delete: free, changeType: free, generateSeats: free, minCapacity: zoneFacts.minCapacity };
}

export function getVenueCapabilities(actor: VenueActor, venue: PolicyVenue, facts: VenueFacts): VenueCapabilities {
  return {
    edit: canEditVenue(actor, venue),
    delete: canDeleteVenue(actor, venue, facts),
    editZones: canEditZones(actor, venue, facts),
  };
}

/** Errors of a zone edit (empty = allowed); `zoneFacts` come from the same read as the rest of the decision. */
export function checkZoneChange(
  current: ZoneChangeState,
  next: ZoneChangeState,
  zoneFacts: ZoneFacts,
): VenueZoneChangeError[] {
  const errors: VenueZoneChangeError[] = [];
  if (zoneFacts.isReferenced && next.seatingType !== current.seatingType) errors.push("type_locked");
  if (next.seatingType === "general_admission" && (next.capacity ?? 0) < zoneFacts.minCapacity) {
    errors.push("capacity_below_in_use");
  }
  return errors;
}

/** The viewer's side of ownership; never reveals who else created a venue. */
export function getVenueOwner(actor: VenueActor, venue: PolicyVenue): VenueOwner {
  if (venue.createdBy === null) return "platform";
  return venue.createdBy === actor.id ? "own" : "other";
}

/** Why the viewer cannot edit the venue; `undefined` when they can. */
export function getEditBlockedReason(actor: VenueActor, venue: PolicyVenue): string | undefined {
  if (canEditVenue(actor, venue)) return undefined;
  if (!canCreateVenue(actor)) return VENUE_MESSAGES.forbidden;
  return venue.createdBy === null ? VENUE_MESSAGES.platform_venue : VENUE_MESSAGES.other_owner;
}

/** Why zones and seats are read-only; `undefined` when they can be edited. */
export function getZonesBlockedReason(actor: VenueActor, venue: PolicyVenue, facts: VenueFacts): string | undefined {
  const reason = getEditBlockedReason(actor, venue);
  if (reason) return reason;
  return facts.hasSales ? VENUE_MESSAGES.has_sales : undefined;
}
