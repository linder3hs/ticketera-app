import type { seatingType } from "@/db/schema";
import type { EventStatus } from "@/modules/event/event-list.types";
import type { OrganizerStatus, Role, StripeOnboardingStatus } from "@/modules/user/user.types";

export type SeatingType = (typeof seatingType.enumValues)[number];

/** `draft` only needs the basics; `publish` also needs at least one zone for sale. */
export type EventIntent = "draft" | "publish";

/** One venue zone row of the form, as typed. An empty `price` means "not for sale". */
export interface EventZoneFormValues {
  venueZoneId: string;
  price: string;
  capacity: string;
}

/** The event form, as typed (strings straight from the inputs). `date` is `YYYY-MM-DD`, `time` is `HH:mm`, both in Lima. */
export interface EventFormValues {
  title: string;
  description: string;
  categoryId: string;
  venueId: string;
  date: string;
  time: string;
  /** Empty or an `https` URL. */
  coverImageUrl: string;
  zones: EventZoneFormValues[];
}

/** A zone for sale after validation. `capacity` is only meaningful for general-admission zones. */
export interface EventZoneInput {
  venueZoneId: string;
  priceCents: number;
  capacity: number | null;
}

/** Validated form values in domain types; zones without a price are already dropped. */
export interface EventWriteInput {
  title: string;
  description: string | null;
  categoryId: string;
  venueId: string;
  startsAt: Date;
  coverImageUrl: string | null;
  zones: EventZoneInput[];
}

/** Who is acting, resolved on the server from the session and the `organizer` row (never from client input). */
export interface PolicyActor {
  role: Role;
  /** `organizer.id` of the actor, `null` when they have no organizer profile. */
  organizerId: string | null;
  organizerStatus: OrganizerStatus | null;
  /** Stripe Connect onboarding of the actor's organizer row, `null` without one. */
  stripeOnboardingStatus: StripeOnboardingStatus | null;
}

/** The slice of an event the policy decides on. */
export interface PolicyEvent {
  organizerId: string;
  status: EventStatus;
  startsAt: Date;
}

/** Sales facts of one event (see the spec's "Definiciones"). */
export interface EventFacts {
  /** Some zone is occupied (sold or held) or there is a non-failed/cancelled order. */
  hasSales: boolean;
  /** Any `orders` or `reservation` row references the event. */
  hasOrders: boolean;
}

/** An event zone as stored, with its occupancy (GA: sold + held; numbered: seats sold or held). */
export interface ZoneState {
  venueZoneId: string;
  seatingType: SeatingType;
  priceCents: number;
  /** `null` for numbered zones. */
  capacity: number | null;
  occupied: number;
}

/** A zone as the publish check sees it. */
export interface PublishZone {
  seatingType: SeatingType;
  priceCents: number;
  capacity: number | null;
}

/** The organizer facts the publish check needs (the same two fields `PolicyActor` carries). */
export interface PublishOrganizer {
  status: OrganizerStatus | null;
  stripeOnboardingStatus: StripeOnboardingStatus | null;
}

export type PublishBlocker =
  | "organizer_not_approved"
  | "connect_incomplete"
  | "no_zones"
  | "zone_without_price"
  | "zone_without_capacity"
  | "starts_in_past";

export type ZoneChangeErrorCode = "price_locked" | "zone_in_use" | "capacity_below_occupied";

export interface ZoneChangeError {
  venueZoneId: string;
  code: ZoneChangeErrorCode;
}

/** Which fields of the form can change (all `false` when the event is read-only). */
export interface EditableFields {
  title: boolean;
  description: boolean;
  coverImageUrl: boolean;
  categoryId: boolean;
  startsAt: boolean;
  venueId: boolean;
}

export type EventActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/** What the actor may do with an event; the UI only hides, the server is the real gate. */
export interface EventCapabilities {
  edit: boolean;
  publish: boolean;
  unpublish: boolean;
  cancel: boolean;
  delete: boolean;
  /** Mark or unmark it as featured on the landing (admin/super_admin, while it is not read-only). */
  feature: boolean;
}

/** An event loaded for the edit form. */
export interface EventForEdit {
  id: string;
  status: EventStatus;
  /** Shown in the landing's Hero while it is also published and upcoming; not part of the form. */
  featured: boolean;
  /** Form values prefilled from the event (zones are only the ones for sale). */
  values: EventFormValues;
  zones: ZoneState[];
  hasSales: boolean;
  /** Cancelled, finished or already started. */
  readOnly: boolean;
  editable: EditableFields;
  capabilities: EventCapabilities;
}

export interface EventCategoryOption {
  id: string;
  label: string;
}

/** A venue zone to configure: `capacity` is the GA capacity or the number of seats of a numbered zone. */
export interface VenueZoneOption {
  id: string;
  name: string;
  seatingType: SeatingType;
  capacity: number;
}

export interface VenueOption {
  id: string;
  name: string;
  city: string;
  zones: VenueZoneOption[];
}

/** An organizer an admin can create an event for. */
export interface OrganizerOption {
  id: string;
  name: string;
}

export interface EventFormOptions {
  categories: EventCategoryOption[];
  venues: VenueOption[];
}
