import { pgErrorCode } from "@/lib/pg-error";
import type { OrderLine, Seat } from "@/modules/booking/booking.types";
import type {
  ActiveReservation,
  NewReservationItem,
  ReservationItemRow,
  ReserveTicketsInput,
  SeatAvailabilityRow,
  TicketRequest,
  UnavailableTickets,
  ZoneAvailabilityRow,
} from "@/modules/booking/reservation.types";

/** How long a reservation holds its tickets. */
export const RESERVATION_MINUTES = 10;

export const RESERVATION_MESSAGES = {
  invalid: "Datos inválidos.",
  eventUnavailable: "Este evento ya no está disponible.",
  unavailable:
    "Algunas entradas que elegiste ya no están disponibles. Actualizamos el mapa: revisa tu selección e intenta de nuevo.",
  generic: "No pudimos reservar tus entradas. Intenta de nuevo.",
} as const;

/** SQLSTATEs of a tripped hold guard: division by zero (count mismatch) and the capacity CHECK. */
const UNAVAILABLE_CODES = new Set(["22012", "23514"]);

/** True when the hold failed because some tickets were no longer available. */
export function isUnavailableError(error: unknown): boolean {
  const code = pgErrorCode(error);
  return code !== undefined && UNAVAILABLE_CODES.has(code);
}

/** Action input from the selection: lines with seats hold those seats, the rest hold a GA quantity. */
export function toReserveInput(slug: string, lines: OrderLine[]): ReserveTicketsInput {
  const input: ReserveTicketsInput = { slug, seats: [], generalAdmission: [] };
  for (const line of lines) {
    if (line.seats.length > 0) {
      input.seats.push({ eventZoneId: line.zoneId, seatIds: line.seats.map((seat) => seat.id) });
    } else {
      input.generalAdmission.push({ eventZoneId: line.zoneId, quantity: line.quantity });
    }
  }
  return input;
}

/** `reservation_item` rows of a request: one per seat (`quantity` 1) and one per GA zone. */
export function toReservationItems(reservationId: string, request: TicketRequest): NewReservationItem[] {
  return [
    ...request.seats.flatMap(({ eventZoneId, seatIds }) =>
      seatIds.map((eventSeatId) => ({ reservationId, eventZoneId, eventSeatId, quantity: 1 })),
    ),
    ...request.generalAdmission.map(({ eventZoneId, quantity }) => ({
      reservationId,
      eventZoneId,
      eventSeatId: null,
      quantity,
    })),
  ];
}

/**
 * What of `request` is no longer available, in request order: seats that are
 * missing, in another zone or not free; GA zones that are missing or have no
 * remaining. A GA zone with some remaining, though less than asked, stays open.
 */
export function findUnavailable(
  request: TicketRequest,
  seatRows: SeatAvailabilityRow[],
  zoneRows: ZoneAvailabilityRow[],
): UnavailableTickets {
  const seatsById = new Map(seatRows.map((row) => [row.id, row]));
  const remainingByZone = new Map(zoneRows.map((row) => [row.id, row.remaining]));

  return {
    seatIds: request.seats.flatMap(({ eventZoneId, seatIds }) =>
      seatIds.filter((seatId) => {
        const row = seatsById.get(seatId);
        return !row || row.eventZoneId !== eventZoneId || !row.free;
      }),
    ),
    zoneIds: request.generalAdmission
      .map(({ eventZoneId }) => eventZoneId)
      .filter((zoneId) => (remainingByZone.get(zoneId) ?? 0) <= 0),
  };
}

/** Rows in natural order ("2" < "10"), then seats by number. */
const bySeatPosition = (a: Seat, b: Seat) => a.row.localeCompare(b.row, undefined, { numeric: true }) || a.number - b.number;

/** The checkout's view of a reservation: one line per zone, in the items' order. */
export function toActiveReservation(
  reservation: { id: string; expiresAt: Date },
  items: ReservationItemRow[],
): ActiveReservation {
  const lines = [...Map.groupBy(items, (item) => item.eventZoneId)].map(([zoneId, zoneItems]): OrderLine => {
    const { zoneName, priceCents } = zoneItems[0];
    const quantity = zoneItems.reduce((total, item) => total + item.quantity, 0);
    const seats = zoneItems
      .flatMap((item): Seat[] =>
        item.eventSeatId === null
          ? []
          : [
              {
                id: item.eventSeatId,
                row: item.rowLabel ?? "",
                number: item.seatNumber ?? 0,
                x: item.x ?? 0,
                y: item.y ?? 0,
                status: "available",
              },
            ],
      )
      .sort(bySeatPosition);

    return { zoneId, zoneName, quantity, amount: (quantity * priceCents) / 100, seats };
  });

  return { id: reservation.id, expiresAt: reservation.expiresAt.toISOString(), lines };
}
