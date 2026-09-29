import type { Event } from "@/modules/event/event.types";
import { getEventById } from "@/modules/event/services/event-service";
import type {
  Seat,
  SeatRow,
  VenueMap,
  Zone,
  ZoneShape,
  ZoneStatus,
} from "@/modules/booking/booking.types";

/**
 * Mock stadium layout shared by every event (see the approved spec
 * `docs/specs/event-detail-seat-selection.md`): two standing zones in front
 * of the stage and three numbered stands.
 */
interface ZoneTemplate {
  id: string;
  name: string;
  shortName: string;
  color: string;
  /** Price relative to the event's `priceFrom` (the cheapest zone is 1). */
  priceFactor: number;
  status: ZoneStatus;
  shape: ZoneShape;
  /** Numbered stands only: row count and seats in the front row. */
  seating?: { rows: number; frontRowSeats: number };
}

const ZONE_TEMPLATES: ZoneTemplate[] = [
  {
    id: "vip",
    name: "Campo VIP",
    shortName: "VIP",
    color: "#D4D4D8",
    priceFactor: 2.76,
    status: "sold-out",
    shape: {
      path: "M272 96 H528 Q548 96 548 116 V170 Q548 188 528 188 H272 Q252 188 252 170 V116 Q252 96 272 96 Z",
      labelX: 400,
      labelY: 142,
    },
  },
  {
    id: "general",
    name: "Campo General",
    shortName: "General",
    color: "#4F46E5",
    priceFactor: 1.8,
    status: "available",
    shape: {
      path: "M244 202 H556 Q576 202 576 222 V352 Q576 372 556 372 H244 Q224 372 224 352 V222 Q224 202 244 202 Z",
      labelX: 400,
      labelY: 287,
    },
  },
  {
    id: "occidente",
    name: "Tribuna Occidente",
    shortName: "Occidente",
    color: "#818CF8",
    priceFactor: 1.52,
    status: "last-tickets",
    shape: {
      path: "M58 64 L180 92 Q164 236 184 384 L86 430 Q30 250 58 64 Z",
      labelX: 118,
      labelY: 246,
    },
    seating: { rows: 10, frontRowSeats: 16 },
  },
  {
    id: "oriente",
    name: "Tribuna Oriente",
    shortName: "Oriente",
    color: "#A5B4FC",
    priceFactor: 1.28,
    status: "available",
    shape: {
      path: "M742 64 L620 92 Q636 236 616 384 L714 430 Q770 250 742 64 Z",
      labelX: 682,
      labelY: 246,
    },
    seating: { rows: 10, frontRowSeats: 16 },
  },
  {
    id: "norte",
    name: "Tribuna Norte",
    shortName: "Norte",
    color: "#C7D2FE",
    priceFactor: 1,
    status: "available",
    shape: {
      path: "M104 446 L198 398 Q400 452 602 398 L696 446 Q400 548 104 446 Z",
      labelX: 400,
      labelY: 470,
    },
    seating: { rows: 12, frontRowSeats: 20 },
  },
];

/** Share of occupied seats by zone status. */
const OCCUPANCY: Record<ZoneStatus, number> = {
  available: 0.35,
  "last-tickets": 0.85,
  "sold-out": 1,
};

/** Distance between seat centers, in SVG units. */
const SEAT_GAP = 28;
/** Extra space left in the middle of each row as an aisle. */
const AISLE = SEAT_GAP;
/** How much rows bend towards the stage at their ends. */
const ROW_CURVE = 0.0002;

/**
 * Deterministic pseudo-random number in [0, 1) (FNV-1a hash). The same
 * event and seat always give the same value, so server and client render
 * the same occupied seats and there's no hydration mismatch.
 */
function seededRandom(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 2 ** 32;
}

function buildRows(
  eventId: string,
  zoneId: string,
  status: ZoneStatus,
  seating: { rows: number; frontRowSeats: number },
): SeatRow[] {
  const widestRow = seating.frontRowSeats + seating.rows - 1;
  const maxHalfWidth = ((widestRow - 1) * SEAT_GAP + AISLE) / 2;

  return Array.from({ length: seating.rows }, (_, rowIndex) => {
    const label = String.fromCharCode(65 + rowIndex);
    // Rows get one seat longer the further they are from the stage.
    const seatCount = seating.frontRowSeats + rowIndex;
    const half = Math.ceil(seatCount / 2);

    const seats: Seat[] = Array.from({ length: seatCount }, (_, seatIndex) => {
      const id = `${zoneId}-${label}${seatIndex + 1}`;
      const offset = (seatIndex - (seatCount - 1) / 2) * SEAT_GAP + (seatIndex < half ? -AISLE / 2 : AISLE / 2);
      const x = maxHalfWidth + offset;
      const y = rowIndex * SEAT_GAP - ROW_CURVE * offset * offset;

      return {
        id,
        row: label,
        number: seatIndex + 1,
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
        status: seededRandom(`${eventId}:${id}`) < OCCUPANCY[status] ? "occupied" : "available",
      };
    });

    return { label, seats };
  });
}

function buildZone(event: Pick<Event, "id" | "priceFrom" | "currency" | "status">, template: ZoneTemplate): Zone {
  // A sold-out event has every zone sold out.
  const status = event.status === "sold-out" ? "sold-out" : template.status;

  return {
    id: template.id,
    name: template.name,
    shortName: template.shortName,
    price: Math.round((event.priceFrom * template.priceFactor) / 10) * 10,
    currency: event.currency,
    color: template.color,
    status,
    kind: template.seating ? "seated" : "general",
    shape: template.shape,
    ...(template.seating && { rows: buildRows(event.id, template.id, status, template.seating) }),
  };
}

/**
 * Returns the zones (with prices in the event's currency) and, for the
 * numbered stands, every seat with its position and availability. Unknown
 * event ids yield `undefined`.
 */
export async function getVenueMap(eventId: string): Promise<VenueMap | undefined> {
  const event = await getEventById(eventId);
  if (!event) return undefined;

  return {
    eventId,
    viewBox: "0 0 800 540",
    stage: { x: 290, y: 28, width: 220, height: 46 },
    zones: ZONE_TEMPLATES.map((template) => buildZone(event, template)),
  };
}
