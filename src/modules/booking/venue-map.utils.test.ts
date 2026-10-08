import { describe, expect, it } from "vitest";

import {
  DEFAULT_ZONE_COLOR,
  EMPTY_ZONE_SHAPE,
  VENUE_STAGE,
  VENUE_VIEWBOX,
  shortZoneName,
  toVenueMap,
  type VenueSeatRow,
  type VenueZoneRow,
} from "@/modules/booking/venue-map.utils";

const EVENT = { id: "evt", currency: "PEN" };

const SHAPE = { path: "M0 0 H10 V10 Z", labelX: 5, labelY: 5 };

const zoneRow = (overrides: Partial<VenueZoneRow> = {}): VenueZoneRow => ({
  id: "z1",
  name: "Campo General",
  priceCents: 15000,
  seatingType: "general_admission",
  color: "#4F46E5",
  mapShape: SHAPE,
  capacity: 100,
  occupied: 0,
  ...overrides,
});

const seatRow = (overrides: Partial<VenueSeatRow> = {}): VenueSeatRow => ({
  id: "s1",
  eventZoneId: "z1",
  rowLabel: "A",
  seatNumber: 1,
  x: 10,
  y: 20,
  status: "available",
  ...overrides,
});

const zoneOf = (overrides: Partial<VenueZoneRow> = {}, seats: VenueSeatRow[] = []) =>
  toVenueMap(EVENT, [zoneRow(overrides)], seats).zones[0];

describe("toVenueMap", () => {
  it("takes eventId from the event and the constant viewBox and stage", () => {
    const map = toVenueMap(EVENT, [], []);

    expect(map).toEqual({ eventId: "evt", viewBox: VENUE_VIEWBOX, stage: VENUE_STAGE, zones: [] });
    expect(map.viewBox).toBe("0 0 800 540");
    expect(map.stage).toEqual({ x: 290, y: 28, width: 220, height: 46 });
  });

  it("keeps the order of the input zones", () => {
    const map = toVenueMap(EVENT, [zoneRow({ id: "b" }), zoneRow({ id: "a" }), zoneRow({ id: "c" })], []);

    expect(map.zones.map((zone) => zone.id)).toEqual(["b", "a", "c"]);
  });

  it("maps a full zone row", () => {
    expect(zoneOf({ id: "z9", name: "Tribuna Occidente" })).toEqual({
      id: "z9",
      name: "Tribuna Occidente",
      shortName: "Occidente",
      price: 150,
      currency: "PEN",
      color: "#4F46E5",
      status: "available",
      kind: "general",
      shape: SHAPE,
    });
  });

  it("derives kind from seating_type", () => {
    expect(zoneOf({ seatingType: "numbered" }).kind).toBe("seated");
    expect(zoneOf({ seatingType: "general_admission" }).kind).toBe("general");
  });

  it("converts the price from cents to units", () => {
    expect(zoneOf({ priceCents: 12550 }).price).toBe(125.5);
  });

  it("takes the currency from the event", () => {
    expect(toVenueMap({ id: "evt", currency: "USD" }, [zoneRow()], []).zones[0].currency).toBe("USD");
  });

  it("falls back to the default color when it is not set", () => {
    expect(zoneOf({ color: null }).color).toBe(DEFAULT_ZONE_COLOR);
  });

  it("derives the status from the zone's capacity and occupancy", () => {
    expect(zoneOf({ capacity: 100, occupied: 89 }).status).toBe("available");
    expect(zoneOf({ capacity: 100, occupied: 90 }).status).toBe("last-tickets");
    expect(zoneOf({ capacity: 100, occupied: 100 }).status).toBe("sold-out");
    expect(zoneOf({ capacity: 0, occupied: 0 }).status).toBe("sold-out");
  });

  it("keeps a valid shape and drops extra keys", () => {
    expect(zoneOf({ mapShape: { ...SHAPE, extra: true } }).shape).toEqual(SHAPE);
  });

  it("uses the empty shape when map_shape is null or malformed", () => {
    expect(zoneOf({ mapShape: null }).shape).toEqual(EMPTY_ZONE_SHAPE);
    expect(zoneOf({ mapShape: { path: 1 } }).shape).toEqual(EMPTY_ZONE_SHAPE);
    expect(zoneOf({ mapShape: { path: "M0 0", labelX: "5", labelY: 5 } }).shape).toEqual(EMPTY_ZONE_SHAPE);
    expect(zoneOf({ mapShape: "M0 0" }).shape).toEqual(EMPTY_ZONE_SHAPE);
  });

  it("puts each seat in its zone by eventZoneId, only in seated zones", () => {
    const map = toVenueMap(
      EVENT,
      [
        zoneRow({ id: "ga", seatingType: "general_admission" }),
        zoneRow({ id: "n1", seatingType: "numbered" }),
        zoneRow({ id: "n2", seatingType: "numbered" }),
      ],
      [
        seatRow({ id: "s-ga", eventZoneId: "ga" }),
        seatRow({ id: "s-n1", eventZoneId: "n1" }),
        seatRow({ id: "s-n2", eventZoneId: "n2" }),
      ],
    );
    const [ga, n1, n2] = map.zones;

    expect(ga).not.toHaveProperty("rows");
    expect(n1.rows?.flatMap((row) => row.seats.map((seat) => seat.id))).toEqual(["s-n1"]);
    expect(n2.rows?.flatMap((row) => row.seats.map((seat) => seat.id))).toEqual(["s-n2"]);
  });

  it("leaves GA zones without rows and seated zones without seats with empty rows", () => {
    expect(zoneOf({ seatingType: "general_admission" })).not.toHaveProperty("rows");
    expect(zoneOf({ seatingType: "numbered" }).rows).toEqual([]);
  });

  it("sorts rows in natural order and seats by number", () => {
    const rows = zoneOf({ seatingType: "numbered" }, [
      seatRow({ id: "10-1", rowLabel: "10", seatNumber: 1 }),
      seatRow({ id: "B-2", rowLabel: "B", seatNumber: 2 }),
      seatRow({ id: "2-1", rowLabel: "2", seatNumber: 1 }),
      seatRow({ id: "A-10", rowLabel: "A", seatNumber: 10 }),
      seatRow({ id: "B-1", rowLabel: "B", seatNumber: 1 }),
      seatRow({ id: "A-2", rowLabel: "A", seatNumber: 2 }),
    ]).rows;

    expect(rows?.map((row) => row.label)).toEqual(["2", "10", "A", "B"]);
    expect(rows?.find((row) => row.label === "A")?.seats.map((seat) => seat.number)).toEqual([2, 10]);
    expect(rows?.find((row) => row.label === "B")?.seats.map((seat) => seat.number)).toEqual([1, 2]);
  });

  it("maps a seat row and defaults null coordinates to 0", () => {
    const [placed, unplaced] = zoneOf({ seatingType: "numbered" }, [
      seatRow({ id: "s1", rowLabel: "C", seatNumber: 1, x: 12.5, y: 30 }),
      seatRow({ id: "s2", rowLabel: "C", seatNumber: 2, x: null, y: null }),
    ]).rows![0].seats;

    expect(placed).toEqual({ id: "s1", row: "C", number: 1, x: 12.5, y: 30, status: "available" });
    expect(unplaced).toMatchObject({ x: 0, y: 0 });
  });

  it("shows only available seats as available; held, sold and blocked are occupied", () => {
    const seats = zoneOf({ seatingType: "numbered" }, [
      seatRow({ seatNumber: 1, status: "available" }),
      seatRow({ seatNumber: 2, status: "held" }),
      seatRow({ seatNumber: 3, status: "sold" }),
      seatRow({ seatNumber: 4, status: "blocked" }),
    ]).rows![0].seats;

    expect(seats.map((seat) => seat.status)).toEqual(["available", "occupied", "occupied", "occupied"]);
  });
});

describe("shortZoneName", () => {
  it("is the last word of the name", () => {
    expect(shortZoneName("Tribuna Occidente")).toBe("Occidente");
  });

  it("is the name itself when it has one word", () => {
    expect(shortZoneName("VIP")).toBe("VIP");
  });

  it("tolerates extra spaces", () => {
    expect(shortZoneName("  Tribuna   Norte  ")).toBe("Norte");
  });
});
