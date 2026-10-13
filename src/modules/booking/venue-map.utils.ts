import { z } from "zod";

import type { eventSeatStatus } from "@/db/schema";
import type { Seat, SeatRow, VenueMap, Zone, ZoneShape } from "@/modules/booking/booking.types";
import type { Event } from "@/modules/event/event.types";
import { availabilityStatus } from "@/modules/event/event-public.utils";
import type { SeatingType } from "@/modules/event/event-write.types";

type EventSeatStatus = (typeof eventSeatStatus.enumValues)[number];

/** Overview viewBox; there is no column for it yet, it is the seeded stadium's (same as the mock). */
export const VENUE_VIEWBOX = "0 0 800 540";

/** Stage rectangle in `VENUE_VIEWBOX` units; same origin as `VENUE_VIEWBOX`. */
export const VENUE_STAGE: VenueMap["stage"] = { x: 290, y: 28, width: 220, height: 46 };

/** Color of a zone whose `venue_zone.color` is not set. */
export const DEFAULT_ZONE_COLOR = "#A1A1AA";

/** Shape of a zone without a valid `map_shape`: still listed, not drawn in the overview. */
export const EMPTY_ZONE_SHAPE: ZoneShape = { path: "", labelX: 0, labelY: 0 };

/** One `event_zone` of the event joined with its `venue_zone`, already resolved to capacity and occupancy. */
export interface VenueZoneRow {
  /** `event_zone.id`. */
  id: string;
  /** `event_zone.name`. */
  name: string;
  priceCents: number;
  seatingType: SeatingType;
  color: string | null;
  /** `venue_zone.map_shape` (jsonb), unvalidated. */
  mapShape: unknown;
  capacity: number;
  occupied: number;
}

/** One `event_seat` of the event joined with its `venue_seat`. */
export interface VenueSeatRow {
  /** `event_seat.id`. */
  id: string;
  eventZoneId: string;
  rowLabel: string;
  seatNumber: number;
  x: number | null;
  y: number | null;
  status: EventSeatStatus;
}

const zoneShapeSchema = z.object({ path: z.string(), labelX: z.number(), labelY: z.number() });

/** Label for tight spots: the last word of the name ("Tribuna Occidente" → "Occidente"). */
export function shortZoneName(name: string): string {
  return name.trim().split(/\s+/).at(-1) ?? "";
}

function toZoneShape(mapShape: unknown): ZoneShape {
  const result = zoneShapeSchema.safeParse(mapShape);
  if (!result.success) return EMPTY_ZONE_SHAPE;
  const { path, labelX, labelY } = result.data;
  return { path, labelX, labelY };
}

/** `blocked` seats look occupied too, though they do not add to the zone's occupancy. */
const toSeat = (row: VenueSeatRow): Seat => ({
  id: row.id,
  row: row.rowLabel,
  number: row.seatNumber,
  x: row.x ?? 0,
  y: row.y ?? 0,
  status: row.status === "available" ? "available" : "occupied",
});

/** Seats of one zone grouped by row: rows in natural order ("2" < "10"), seats by number. */
function toSeatRows(seats: VenueSeatRow[]): SeatRow[] {
  return [...Map.groupBy(seats, (seat) => seat.rowLabel)]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([label, rowSeats]) => ({
      label,
      seats: rowSeats.map(toSeat).sort((a, b) => a.number - b.number),
    }));
}

/** Maps the event's zone and seat rows to its `VenueMap`, keeping the order of `zones`. */
export function toVenueMap(
  event: Pick<Event, "id" | "currency">,
  zones: VenueZoneRow[],
  seats: VenueSeatRow[],
): VenueMap {
  const seatsByZone = Map.groupBy(seats, (seat) => seat.eventZoneId);

  return {
    eventId: event.id,
    viewBox: VENUE_VIEWBOX,
    stage: VENUE_STAGE,
    zones: zones.map((row): Zone => {
      const kind = row.seatingType === "numbered" ? "seated" : "general";
      return {
        id: row.id,
        name: row.name,
        shortName: shortZoneName(row.name),
        price: row.priceCents / 100,
        currency: event.currency,
        color: row.color ?? DEFAULT_ZONE_COLOR,
        status: availabilityStatus(row.capacity, row.occupied),
        kind,
        shape: toZoneShape(row.mapShape),
        ...(kind === "seated" && { rows: toSeatRows(seatsByZone.get(row.id) ?? []) }),
      };
    }),
  };
}
