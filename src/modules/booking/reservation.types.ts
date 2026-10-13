import type { OrderLine } from "@/modules/booking/booking.types";

/*
 * Wire contract of the reservation (Server Action ↔ client). Dates travel as
 * ISO 8601 UTC strings (`Date#toISOString()`), never as `Date`.
 */

export interface SeatRequest {
  eventZoneId: string;
  seatIds: string[];
}

export interface GeneralAdmissionRequest {
  eventZoneId: string;
  quantity: number;
}

export interface TicketRequest {
  seats: SeatRequest[];
  generalAdmission: GeneralAdmissionRequest[];
}

/** Action input: the event by its public slug plus what to hold. */
export interface ReserveTicketsInput extends TicketRequest {
  slug: string;
}

/** Found unavailable after a failed hold. `zoneIds`: GA zones with no live remaining. */
export interface UnavailableTickets {
  seatIds: string[];
  zoneIds: string[];
}

export type ReserveTicketsResult =
  | { ok: true; data: { reservationId: string; expiresAt: string } }
  | { ok: false; error: string; unavailable?: UnavailableTickets };

/** The user's live reservation for an event, as the checkout shows it. */
export interface ActiveReservation {
  id: string;
  expiresAt: string;
  lines: OrderLine[];
}

/* Rows of the pure mappings (`reservation.utils.ts`). */

/** One `reservation_item` to insert: a seat (`quantity` 1) or a GA zone (`eventSeatId` null). */
export interface NewReservationItem {
  reservationId: string;
  eventZoneId: string;
  eventSeatId: string | null;
  quantity: number;
}

/** A requested seat read after a failed hold; `free` = its effective status for the reader is `available`. */
export interface SeatAvailabilityRow {
  /** `event_seat.id`. */
  id: string;
  eventZoneId: string;
  free: boolean;
}

/** A requested GA zone read after a failed hold; `remaining` = capacity − live occupancy for the reader. */
export interface ZoneAvailabilityRow {
  /** `event_zone.id`. */
  id: string;
  remaining: number;
}

/**
 * One `reservation_item` joined with its zone and, for numbered zones, its
 * seat. Seat fields are null in GA; `x`/`y` may be null for a seat too.
 */
export interface ReservationItemRow {
  eventZoneId: string;
  /** `event_zone.name`. */
  zoneName: string;
  priceCents: number;
  quantity: number;
  eventSeatId: string | null;
  rowLabel: string | null;
  seatNumber: number | null;
  x: number | null;
  y: number | null;
}
