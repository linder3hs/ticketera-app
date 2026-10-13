import { z } from "zod";

import { DEFAULT_ZONE_COLOR, VENUE_VIEWBOX } from "@/modules/booking/venue-map.utils";
import type {
  BuiltZoneShape,
  GeneratedSeat,
  SeatGeneratorFormValues,
  SeatGeneratorInput,
  StoredZoneShape,
  VenueFormValues,
  VenueSummary,
  ZoneForEdit,
  ZoneFormValues,
  ZoneShapeParams,
  ZoneSummaryInput,
} from "@/modules/venue/venue.types";

/** Width and height of the overview map, taken from `VENUE_VIEWBOX` (`0 0 800 540`). */
const [VIEWBOX_WIDTH, VIEWBOX_HEIGHT] = VENUE_VIEWBOX.split(" ").slice(2).map(Number);
export const VENUE_BOUNDS = { width: VIEWBOX_WIDTH, height: VIEWBOX_HEIGHT } as const;

/** Minimum width and height of a zone shape, in viewBox units. */
export const MIN_SHAPE_SIZE = 20;

/** Distance between neighbouring seats (and rows) of a generated grid; same as the seed and the mock. */
export const SEAT_SPACING = 28;

/** Most seats one generation can create (one insert, one batch). */
export const MAX_SEATS_PER_GENERATION = 2000;

export const EMPTY_VENUE_FORM_VALUES: VenueFormValues = { name: "", address: "", city: "", lat: "", lng: "" };

export const EMPTY_ZONE_FORM_VALUES: ZoneFormValues = {
  name: "",
  seatingType: "general_admission",
  capacity: "",
  color: DEFAULT_ZONE_COLOR,
  sortOrder: "0",
  shape: { kind: "", x: "", y: "", width: "", height: "" },
};

export const EMPTY_SEAT_GENERATOR_FORM_VALUES: Required<SeatGeneratorFormValues> = {
  rows: "",
  seatsPerRow: "",
  firstRowLabel: "A",
  startNumber: "1",
};

/** Rounds to one decimal (and never returns `-0`), the precision of stored coordinates. */
const round1 = (value: number): number => Math.round(value * 10) / 10 + 0;

/**
 * Shape of a zone in the overview map: the `{ path, labelX, labelY }` the public
 * map reads, plus the parameters that generated it (so the editor can show them).
 * The label sits at the center.
 */
export function buildZoneShape(params: ZoneShapeParams): BuiltZoneShape {
  const { kind, x, y, width, height } = params;
  const right = round1(x + width);
  const bottom = round1(y + height);
  const labelX = round1(x + width / 2);
  const labelY = round1(y + height / 2);

  const path =
    kind === "rectangle"
      ? `M${x} ${y}L${right} ${y}L${right} ${bottom}L${x} ${bottom}Z`
      : `M${x} ${labelY}A${round1(width / 2)} ${round1(height / 2)} 0 1 0 ${right} ${labelY}` +
        `A${round1(width / 2)} ${round1(height / 2)} 0 1 0 ${x} ${labelY}Z`;

  return { path, labelX, labelY, kind, x, y, width, height };
}

const storedShapeSchema = z.object({
  path: z.string().min(1),
  labelX: z.number(),
  labelY: z.number(),
  kind: z.enum(["rectangle", "ellipse"]).optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
});

/** Reads `venue_zone.map_shape` (jsonb): built here (has `kind` and its numbers), custom (only the path) or `null`. */
export function parseStoredShape(mapShape: unknown): StoredZoneShape | null {
  const result = storedShapeSchema.safeParse(mapShape);
  if (!result.success) return null;

  const { path, labelX, labelY, kind, x, y, width, height } = result.data;
  if (kind && x !== undefined && y !== undefined && width !== undefined && height !== undefined) {
    return { path, labelX, labelY, kind, x, y, width, height };
  }
  return { path, labelX, labelY };
}

/** The zone as the form shows it. A custom (seeded) shape is not editable: the form keeps it unless a new shape is chosen. */
export function toZoneFormValues(zone: ZoneForEdit): ZoneFormValues {
  const { shape } = zone;
  return {
    name: zone.name,
    seatingType: zone.seatingType,
    capacity: zone.capacity === null ? "" : String(zone.capacity),
    color: zone.color ?? DEFAULT_ZONE_COLOR,
    sortOrder: String(zone.sortOrder),
    shape: shape?.kind
      ? { kind: shape.kind, x: String(shape.x), y: String(shape.y), width: String(shape.width), height: String(shape.height) }
      : { kind: "", x: "", y: "", width: "", height: "" },
  };
}

/** `A`, `B`… `Z`, `AA`, `AB`…: bijective base 26. `index` is how many rows after `firstLabel`. */
export function rowLabelAt(firstLabel: string, index: number): string {
  let n = [...firstLabel].reduce((acc, char) => acc * 26 + (char.charCodeAt(0) - 64), 0) + index;
  let label = "";
  while (n > 0) {
    n -= 1;
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26);
  }
  return label;
}

/**
 * The seats of a straight grid, row by row. Positions are deterministic and
 * required: with `x`/`y` null the public seat map stacks every seat at one point.
 * Each row is centered on `x = 0`; rows go down by `SEAT_SPACING`.
 */
export function generateSeats(input: SeatGeneratorInput): GeneratedSeat[] {
  const { rows, seatsPerRow, firstRowLabel, startNumber } = input;
  const seats: GeneratedSeat[] = [];

  for (let row = 0; row < rows; row++) {
    const rowLabel = rowLabelAt(firstRowLabel, row);
    for (let col = 0; col < seatsPerRow; col++) {
      seats.push({
        rowLabel,
        seatNumber: startNumber + col,
        x: round1((col - (seatsPerRow - 1) / 2) * SEAT_SPACING),
        y: round1(row * SEAT_SPACING),
      });
    }
  }
  return seats;
}

/** A zone people can buy: general admission with capacity, or numbered with seats. */
const isZoneUsable = (zone: ZoneSummaryInput): boolean =>
  zone.seatingType === "numbered" ? zone.seatCount > 0 : (zone.capacity ?? 0) >= 1;

export function summarizeVenue(zones: ZoneSummaryInput[]): VenueSummary {
  return {
    zoneCount: zones.length,
    seatCount: zones.reduce((sum, zone) => sum + zone.seatCount, 0),
    capacity: zones.reduce(
      (sum, zone) => sum + (zone.seatingType === "numbered" ? zone.seatCount : (zone.capacity ?? 0)),
      0,
    ),
    usable: zones.some(isZoneUsable),
  };
}
