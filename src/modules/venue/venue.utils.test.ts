import { describe, expect, it } from "vitest";

import { DEFAULT_ZONE_COLOR } from "@/modules/booking/venue-map.utils";
import type { ZoneForEdit } from "@/modules/venue/venue.types";
import {
  VENUE_BOUNDS,
  buildZoneShape,
  generateSeats,
  parseStoredShape,
  rowLabelAt,
  summarizeVenue,
  toZoneFormValues,
} from "@/modules/venue/venue.utils";

describe("VENUE_BOUNDS", () => {
  it("reads the public map viewBox", () => {
    expect(VENUE_BOUNDS).toEqual({ width: 800, height: 540 });
  });
});

describe("buildZoneShape", () => {
  it("draws a rectangle with the label at its center", () => {
    expect(buildZoneShape({ kind: "rectangle", x: 100, y: 200, width: 300, height: 80 })).toEqual({
      path: "M100 200L400 200L400 280L100 280Z",
      labelX: 250,
      labelY: 240,
      kind: "rectangle",
      x: 100,
      y: 200,
      width: 300,
      height: 80,
    });
  });

  it("draws an ellipse as two arcs with the label at its center", () => {
    expect(buildZoneShape({ kind: "ellipse", x: 100, y: 200, width: 300, height: 80 })).toEqual({
      path: "M100 240A150 40 0 1 0 400 240A150 40 0 1 0 100 240Z",
      labelX: 250,
      labelY: 240,
      kind: "ellipse",
      x: 100,
      y: 200,
      width: 300,
      height: 80,
    });
  });

  it("rounds odd sizes to one decimal", () => {
    const shape = buildZoneShape({ kind: "rectangle", x: 10, y: 10, width: 25, height: 21 });
    expect(shape).toMatchObject({ labelX: 22.5, labelY: 20.5 });
  });
});

describe("parseStoredShape", () => {
  it("returns a built shape with its parameters", () => {
    const built = buildZoneShape({ kind: "ellipse", x: 10, y: 20, width: 100, height: 50 });
    expect(parseStoredShape(built)).toEqual(built);
  });

  it("keeps a seeded shape (no kind) as custom, dropping extra keys", () => {
    expect(parseStoredShape({ path: "M0 0L10 10Z", labelX: 5, labelY: 5, extra: true })).toEqual({
      path: "M0 0L10 10Z",
      labelX: 5,
      labelY: 5,
    });
  });

  it.each([null, undefined, {}, { path: "", labelX: 0, labelY: 0 }, "M0 0", { path: "M0", labelX: "1", labelY: 0 }])(
    "gives null for %j",
    (value) => {
      expect(parseStoredShape(value)).toBeNull();
    },
  );
});

describe("toZoneFormValues", () => {
  const zone: ZoneForEdit = {
    id: "z1",
    name: "VIP",
    seatingType: "general_admission",
    capacity: 250,
    color: null,
    sortOrder: 2,
    shape: buildZoneShape({ kind: "rectangle", x: 10, y: 20, width: 100, height: 50 }),
    seatCount: 0,
    isReferenced: false,
    capabilities: { delete: true, changeType: true, generateSeats: true, minCapacity: 0 },
  };

  it("turns the zone into form strings, with the default color and the shape parameters", () => {
    expect(toZoneFormValues(zone)).toEqual({
      name: "VIP",
      seatingType: "general_admission",
      capacity: "250",
      color: DEFAULT_ZONE_COLOR,
      sortOrder: "2",
      shape: { kind: "rectangle", x: "10", y: "20", width: "100", height: "50" },
    });
  });

  it("leaves the shape inputs empty for a custom shape or none", () => {
    const empty = { kind: "", x: "", y: "", width: "", height: "" };
    const custom = { ...zone, shape: { path: "M0 0Z", labelX: 0, labelY: 0 }, seatingType: "numbered", capacity: null } as const;

    expect(toZoneFormValues(custom)).toMatchObject({ capacity: "", shape: empty });
    expect(toZoneFormValues({ ...zone, shape: null }).shape).toEqual(empty);
  });
});

describe("rowLabelAt", () => {
  it("counts A to Z and then AA, AB", () => {
    expect(rowLabelAt("A", 0)).toBe("A");
    expect(rowLabelAt("A", 1)).toBe("B");
    expect(rowLabelAt("A", 25)).toBe("Z");
    expect(rowLabelAt("A", 26)).toBe("AA");
    expect(rowLabelAt("A", 27)).toBe("AB");
    expect(rowLabelAt("A", 51)).toBe("AZ");
    expect(rowLabelAt("A", 52)).toBe("BA");
  });

  it("starts from any first label", () => {
    expect(rowLabelAt("C", 0)).toBe("C");
    expect(rowLabelAt("C", 2)).toBe("E");
    expect(rowLabelAt("Y", 2)).toBe("AA");
    expect(rowLabelAt("AZ", 1)).toBe("BA");
  });
});

describe("generateSeats", () => {
  const input = { rows: 3, seatsPerRow: 4, firstRowLabel: "A", startNumber: 1 };

  it("creates rows x seatsPerRow seats, row by row", () => {
    const seats = generateSeats(input);
    expect(seats).toHaveLength(12);
    expect(seats[0]).toMatchObject({ rowLabel: "A", seatNumber: 1 });
    expect(seats[4]).toMatchObject({ rowLabel: "B", seatNumber: 1 });
    expect(seats[11]).toMatchObject({ rowLabel: "C", seatNumber: 4 });
  });

  it("numbers from startNumber and labels from firstRowLabel", () => {
    const seats = generateSeats({ rows: 2, seatsPerRow: 3, firstRowLabel: "Z", startNumber: 10 });
    expect(seats.map((seat) => `${seat.rowLabel}${seat.seatNumber}`)).toEqual(["Z10", "Z11", "Z12", "AA10", "AA11", "AA12"]);
  });

  it("centers each row on x = 0 with a 28 spacing, rows going down by 28", () => {
    const seats = generateSeats(input);
    expect(seats.slice(0, 4).map((seat) => seat.x)).toEqual([-42, -14, 14, 42]);
    expect(seats.map((seat) => seat.y)).toEqual([0, 0, 0, 0, 28, 28, 28, 28, 56, 56, 56, 56]);
  });

  it("puts the middle seat of an odd row at x = 0 and rounds to one decimal", () => {
    expect(generateSeats({ ...input, rows: 1, seatsPerRow: 3 }).map((seat) => seat.x)).toEqual([-28, 0, 28]);
    expect(Object.is(generateSeats({ ...input, rows: 1, seatsPerRow: 1 })[0].x, 0)).toBe(true);
    for (const seat of generateSeats({ rows: 5, seatsPerRow: 7, firstRowLabel: "A", startNumber: 1 })) {
      expect(seat.x).toBe(Math.round(seat.x * 10) / 10);
    }
  });

  it("has no duplicated (row, number) and is deterministic", () => {
    const seats = generateSeats({ rows: 30, seatsPerRow: 60, firstRowLabel: "A", startNumber: 1 });
    expect(new Set(seats.map((seat) => `${seat.rowLabel}-${seat.seatNumber}`)).size).toBe(seats.length);
    expect(generateSeats(input)).toEqual(generateSeats(input));
  });
});

describe("summarizeVenue", () => {
  it("is empty and not usable without zones", () => {
    expect(summarizeVenue([])).toEqual({ zoneCount: 0, seatCount: 0, capacity: 0, usable: false });
  });

  it("adds general-admission capacity and numbered seats", () => {
    expect(
      summarizeVenue([
        { seatingType: "general_admission", capacity: 500, seatCount: 0 },
        { seatingType: "numbered", capacity: null, seatCount: 120 },
      ]),
    ).toEqual({ zoneCount: 2, seatCount: 120, capacity: 620, usable: true });
  });

  it("is usable with one general-admission zone of capacity >= 1", () => {
    expect(summarizeVenue([{ seatingType: "general_admission", capacity: 1, seatCount: 0 }]).usable).toBe(true);
  });

  it("is not usable with a numbered zone without seats or a general-admission one without capacity", () => {
    expect(summarizeVenue([{ seatingType: "numbered", capacity: null, seatCount: 0 }])).toMatchObject({ zoneCount: 1, usable: false });
    expect(summarizeVenue([{ seatingType: "general_admission", capacity: null, seatCount: 0 }]).usable).toBe(false);
    expect(summarizeVenue([{ seatingType: "general_admission", capacity: 0, seatCount: 0 }]).usable).toBe(false);
  });

  it("is usable when any zone is, even beside an empty numbered one", () => {
    expect(
      summarizeVenue([
        { seatingType: "numbered", capacity: null, seatCount: 0 },
        { seatingType: "numbered", capacity: null, seatCount: 10 },
      ]).usable,
    ).toBe(true);
  });
});
