import type { ZoneShape } from "@/modules/booking/booking.types";
import type { SeatingType } from "@/modules/event/event-write.types";
import type { Role } from "@/modules/user/user.types";

export type { SeatingType };

/** Result of every venue action and write service; `error` is a message safe to show. */
export type VenueActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/** Who is acting: `id` and `role` of the session user (`UserRecord`). `venue.created_by` points to `user`, not to `organizer`. */
export interface VenueActor {
  id: string;
  role: Role;
}

/** The slice of a venue the policy decides on. `null` = seeded (platform) venue. */
export interface PolicyVenue {
  createdBy: string | null;
}

/** Venue-level facts (see the spec's "Definiciones"). */
export interface VenueFacts {
  /** Some `event` uses the venue, in any status: it cannot be deleted. */
  isReferenced: boolean;
  /** Some event of the venue has sales (`eventHasSales`): zones and seats become read-only. */
  hasSales: boolean;
}

/** Facts of one venue zone. */
export interface ZoneFacts {
  /** Some `event_zone` uses the zone: it cannot be deleted, change type or regenerate seats. */
  isReferenced: boolean;
  /** Largest `event_zone.capacity` among the event zones that use it (0 when none). */
  minCapacity: number;
}

export interface VenueCapabilities {
  edit: boolean;
  delete: boolean;
  /** Create, edit, delete zones and generate seats. */
  editZones: boolean;
}

/**
 * What the zone itself allows, from its facts. The caller also needs
 * `VenueCapabilities.editZones`: nothing about a zone changes without it.
 */
export interface ZoneCapabilities {
  delete: boolean;
  changeType: boolean;
  generateSeats: boolean;
  minCapacity: number;
}

/** Why `checkZoneChange` rejects a zone edit. */
export type VenueZoneChangeError = "type_locked" | "capacity_below_in_use";

/** The part of a zone `checkZoneChange` compares. `capacity` is `null` for numbered zones. */
export interface ZoneChangeState {
  seatingType: SeatingType;
  capacity: number | null;
}

/** Who made the venue, from the viewer's side. Never exposes another user's identity. */
export type VenueOwner = "own" | "platform" | "other";

/* ---- Zone shape ---- */

export type ZoneShapeKind = "rectangle" | "ellipse";

/** The 5 numbers the user types, in `VENUE_VIEWBOX` units. */
export interface ZoneShapeParams {
  kind: ZoneShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What `buildZoneShape` stores in `venue_zone.map_shape`: the public map reads `path`/`labelX`/`labelY`, the rest regenerates it. */
export type BuiltZoneShape = ZoneShape & ZoneShapeParams;

/** A shape as read from the DB: built here (`kind` set) or custom, as seeded (no `kind`, shown as "Forma personalizada"). */
export type StoredZoneShape = BuiltZoneShape | (ZoneShape & { kind?: undefined });

/** Shape inputs as typed. `kind: ""` = no shape (create) or keep the current one (update). */
export interface ZoneShapeFormValues {
  kind: "" | ZoneShapeKind;
  x: string;
  y: string;
  width: string;
  height: string;
}

/* ---- Form values (strings) and validated input (domain types) ---- */

/** The venue form, as typed. `lat`/`lng` are empty or a decimal number. */
export interface VenueFormValues {
  name: string;
  address: string;
  city: string;
  lat: string;
  lng: string;
}

export interface VenueInput {
  name: string;
  address: string;
  city: string;
  /** Both set or both `null`. */
  lat: number | null;
  lng: number | null;
}

/** The zone form, as typed. `capacity` is only read for general-admission zones. */
export interface ZoneFormValues {
  name: string;
  seatingType: SeatingType;
  capacity: string;
  /** `#RRGGBB`. */
  color: string;
  sortOrder: string;
  shape?: ZoneShapeFormValues;
}

export interface ZoneInput {
  name: string;
  seatingType: SeatingType;
  /** `null` for numbered zones. */
  capacity: number | null;
  color: string;
  sortOrder: number;
  /** `undefined`: no shape (create) or keep the current one (update). */
  shape?: ZoneShapeParams;
}

/** The seat generator form, as typed. Empty `firstRowLabel` / `startNumber` mean the default (`A` / `1`). */
export interface SeatGeneratorFormValues {
  rows: string;
  seatsPerRow: string;
  firstRowLabel?: string;
  startNumber?: string;
}

export interface SeatGeneratorInput {
  rows: number;
  seatsPerRow: number;
  firstRowLabel: string;
  startNumber: number;
}

/** One `venue_seat` to insert, with its grid position. */
export interface GeneratedSeat {
  rowLabel: string;
  seatNumber: number;
  x: number;
  y: number;
}

/* ---- Read models (T2 builds them, T3/T4 render them) ---- */

/** The part of a zone `summarizeVenue` counts. `seatCount` is the number of `venue_seat` of the zone. */
export interface ZoneSummaryInput {
  seatingType: SeatingType;
  capacity: number | null;
  seatCount: number;
}

export interface VenueSummary {
  zoneCount: number;
  seatCount: number;
  /** General-admission capacity plus numbered seats. */
  capacity: number;
  /** At least one usable zone: general admission with capacity >= 1, or numbered with at least one seat. */
  usable: boolean;
}

/** One row of `/organizer/venues`. */
export interface VenueListRow extends VenueSummary {
  id: string;
  name: string;
  city: string;
  owner: VenueOwner;
  capabilities: VenueCapabilities;
  /** Server-computed reason the venue cannot be edited or deleted, when applicable. */
  blockedReason?: string;
}

/** One zone of the venue editor, ready to render and to prefill `ZoneFormValues`. */
export interface ZoneForEdit {
  id: string;
  name: string;
  seatingType: SeatingType;
  /** `null` for numbered zones. */
  capacity: number | null;
  color: string | null;
  sortOrder: number;
  shape: StoredZoneShape | null;
  seatCount: number;
  /** Same as `ZoneFacts.isReferenced`. */
  isReferenced: boolean;
  capabilities: ZoneCapabilities;
}

/** `/organizer/venues/[id]`. */
export interface VenueForEdit {
  id: string;
  values: VenueFormValues;
  owner: VenueOwner;
  facts: VenueFacts;
  capabilities: VenueCapabilities;
  /** Server-computed reason the venue data cannot be edited, when applicable. */
  editBlockedReason?: string;
  /** Server-computed reason the zones cannot be edited, when applicable. */
  zonesBlockedReason?: string;
  zones: ZoneForEdit[];
}
