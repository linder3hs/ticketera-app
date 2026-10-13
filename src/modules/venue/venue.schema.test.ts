import { describe, expect, it } from "vitest";

import {
  getSeatGeneratorErrors,
  getVenueErrors,
  getZoneErrors,
  seatGeneratorSchema,
  venueSchema,
  zoneSchema,
} from "@/modules/venue/venue.schema";
import type { VenueFormValues, ZoneFormValues } from "@/modules/venue/venue.types";

const VENUE: VenueFormValues = { name: "Estadio Nacional", address: "Av. José Díaz s/n", city: "Lima", lat: "", lng: "" };

const withVenue = (patch: Partial<VenueFormValues>): VenueFormValues => ({ ...VENUE, ...patch });

describe("venueSchema", () => {
  it("parses the form strings, trimming text and turning empty coordinates into null", () => {
    const result = venueSchema.safeParse({ name: "  Estadio  ", address: " Av. 1 ", city: " Lima ", lat: "", lng: "" });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ name: "Estadio", address: "Av. 1", city: "Lima", lat: null, lng: null });
  });

  it("parses coordinates into numbers", () => {
    const result = venueSchema.safeParse(withVenue({ lat: "-12.0464", lng: " -77.0428 " }));
    expect(result.data).toMatchObject({ lat: -12.0464, lng: -77.0428 });
  });

  it("accepts the limits of lat and lng", () => {
    expect(venueSchema.safeParse(withVenue({ lat: "90", lng: "180" })).success).toBe(true);
    expect(venueSchema.safeParse(withVenue({ lat: "-90", lng: "-180" })).success).toBe(true);
    expect(venueSchema.safeParse(withVenue({ lat: "0", lng: "0" })).success).toBe(true);
  });

  it("checks the lengths of name, address and city", () => {
    expect(getVenueErrors(withVenue({ name: " a " })).name).toBeDefined();
    expect(getVenueErrors(withVenue({ name: "x".repeat(121) })).name).toBeDefined();
    expect(getVenueErrors(withVenue({ name: "x".repeat(120) })).name).toBeUndefined();
    expect(getVenueErrors(withVenue({ address: "a" })).address).toBeDefined();
    expect(getVenueErrors(withVenue({ address: "x".repeat(201) })).address).toBeDefined();
    expect(getVenueErrors(withVenue({ city: "" })).city).toBeDefined();
    expect(getVenueErrors(withVenue({ city: "x".repeat(81) })).city).toBeDefined();
  });

  it.each([
    ["91", "0"],
    ["-90.1", "0"],
    ["abc", "0"],
    ["1e2", "0"],
  ])("rejects lat %j", (lat, lng) => {
    expect(getVenueErrors(withVenue({ lat, lng })).lat).toBeDefined();
  });

  it.each(["181", "-180.5", "abc", "12,5"])("rejects lng %j", (lng) => {
    expect(getVenueErrors(withVenue({ lat: "0", lng })).lng).toBeDefined();
  });

  it("requires both coordinates or none", () => {
    expect(getVenueErrors(withVenue({ lat: "-12.04" }))).toEqual({ lng: "Escribe también la longitud." });
    expect(getVenueErrors(withVenue({ lng: "-77.04" }))).toEqual({ lat: "Escribe también la latitud." });
    expect(getVenueErrors(VENUE)).toEqual({});
  });

  it("reports the same errors the server gets (one schema)", () => {
    const values = withVenue({ name: "", lat: "100", lng: "" });
    const errors = getVenueErrors(values);
    expect(errors.name).toBeDefined();
    expect(errors.lat).toBe("Latitud inválida: un número entre -90 y 90.");
  });
});

const GA: ZoneFormValues = {
  name: "General",
  seatingType: "general_admission",
  capacity: "500",
  color: "#FF8800",
  sortOrder: "0",
};

const withZone = (patch: Partial<ZoneFormValues>): ZoneFormValues => ({ ...GA, ...patch });
const shape = (patch: Partial<NonNullable<ZoneFormValues["shape"]>> = {}) => ({
  kind: "rectangle" as const,
  x: "100",
  y: "100",
  width: "200",
  height: "100",
  ...patch,
});

describe("zoneSchema", () => {
  it("parses a general-admission zone into domain types", () => {
    const result = zoneSchema.safeParse({ ...GA, name: "  General  ", sortOrder: "3" });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      name: "General",
      seatingType: "general_admission",
      capacity: 500,
      color: "#FF8800",
      sortOrder: 3,
    });
  });

  it("requires a capacity for general admission", () => {
    expect(getZoneErrors(withZone({ capacity: "" })).capacity).toBeDefined();
  });

  it.each(["0", "1.5", "abc", "-3", "100001", "1e3"])("rejects capacity %j", (capacity) => {
    expect(getZoneErrors(withZone({ capacity })).capacity).toBeDefined();
  });

  it.each(["1", "100000"])("accepts capacity %j", (capacity) => {
    expect(zoneSchema.safeParse(withZone({ capacity })).success).toBe(true);
  });

  it("drops the capacity of a numbered zone, whatever was typed", () => {
    expect(zoneSchema.safeParse(withZone({ seatingType: "numbered", capacity: "500" })).data).toMatchObject({
      seatingType: "numbered",
      capacity: null,
    });
    expect(zoneSchema.safeParse(withZone({ seatingType: "numbered", capacity: "abc" })).success).toBe(true);
    expect(zoneSchema.safeParse(withZone({ seatingType: "numbered", capacity: "" })).data).toMatchObject({ capacity: null });
  });

  it("requires a name of 1 to 60 characters", () => {
    expect(getZoneErrors(withZone({ name: "   " })).name).toBeDefined();
    expect(getZoneErrors(withZone({ name: "x".repeat(61) })).name).toBeDefined();
    expect(getZoneErrors(withZone({ name: "x".repeat(60) })).name).toBeUndefined();
  });

  it("rejects an unknown seating type", () => {
    expect(getZoneErrors(withZone({ seatingType: "standing" as never })).seatingType).toBeDefined();
  });

  it.each(["red", "#FFF", "#GGGGGG", "FF8800", "#FF88001", ""])("rejects color %j", (color) => {
    expect(getZoneErrors(withZone({ color })).color).toBeDefined();
  });

  it("accepts lowercase hex colors", () => {
    expect(zoneSchema.safeParse(withZone({ color: "#ff8800" })).success).toBe(true);
  });

  it.each(["-1", "1.5", "abc", ""])("rejects sort order %j", (sortOrder) => {
    expect(getZoneErrors(withZone({ sortOrder })).sortOrder).toBeDefined();
  });

  describe("shape", () => {
    it("leaves the shape out when no kind is chosen", () => {
      const result = zoneSchema.safeParse(withZone({ shape: { kind: "", x: "", y: "", width: "", height: "" } }));
      expect(result.success).toBe(true);
      expect(result.data).not.toHaveProperty("shape");
      expect(zoneSchema.safeParse(GA).data).not.toHaveProperty("shape");
    });

    it("parses the 5 parameters into numbers", () => {
      const result = zoneSchema.safeParse(withZone({ shape: shape({ kind: "ellipse", x: "10.5" }) }));
      expect(result.data).toMatchObject({ shape: { kind: "ellipse", x: 10.5, y: 100, width: 200, height: 100 } });
    });

    it("accepts a shape that fills the whole viewBox and the minimum size", () => {
      expect(zoneSchema.safeParse(withZone({ shape: shape({ x: "0", y: "0", width: "800", height: "540" }) })).success).toBe(true);
      expect(zoneSchema.safeParse(withZone({ shape: shape({ width: "20", height: "20" }) })).success).toBe(true);
    });

    it("rejects a width or height below 20", () => {
      expect(getZoneErrors(withZone({ shape: shape({ width: "19" }) }))["shape.width"]).toBeDefined();
      expect(getZoneErrors(withZone({ shape: shape({ height: "0" }) }))["shape.height"]).toBeDefined();
    });

    it("rejects a shape outside the 800 x 540 viewBox", () => {
      expect(getZoneErrors(withZone({ shape: shape({ x: "700", width: "101" }) }))["shape.width"]).toBeDefined();
      expect(getZoneErrors(withZone({ shape: shape({ y: "500", height: "41" }) }))["shape.height"]).toBeDefined();
    });

    it.each(["", "abc", "-5"])("rejects x %j", (x) => {
      expect(getZoneErrors(withZone({ shape: shape({ x }) }))["shape.x"]).toBeDefined();
    });
  });
});

describe("seatGeneratorSchema", () => {
  it("parses and applies the defaults A and 1", () => {
    const result = seatGeneratorSchema.safeParse({ rows: "5", seatsPerRow: "10" });
    expect(result.data).toEqual({ rows: 5, seatsPerRow: 10, firstRowLabel: "A", startNumber: 1 });
    expect(seatGeneratorSchema.safeParse({ rows: "5", seatsPerRow: "10", firstRowLabel: "", startNumber: "" }).data).toEqual(
      result.data,
    );
  });

  it("parses every field", () => {
    const result = seatGeneratorSchema.safeParse({ rows: " 3 ", seatsPerRow: "4", firstRowLabel: "C", startNumber: "11" });
    expect(result.data).toEqual({ rows: 3, seatsPerRow: 4, firstRowLabel: "C", startNumber: 11 });
  });

  it.each(["0", "51", "1.5", "abc", ""])("rejects rows %j", (rows) => {
    expect(getSeatGeneratorErrors({ rows, seatsPerRow: "10" }).rows).toBeDefined();
  });

  it.each(["0", "101", "2.5", "abc", ""])("rejects seatsPerRow %j", (seatsPerRow) => {
    expect(getSeatGeneratorErrors({ rows: "5", seatsPerRow }).seatsPerRow).toBeDefined();
  });

  it("accepts the limits 1 and 50 / 100", () => {
    expect(seatGeneratorSchema.safeParse({ rows: "1", seatsPerRow: "1" }).success).toBe(true);
    expect(seatGeneratorSchema.safeParse({ rows: "20", seatsPerRow: "100" }).success).toBe(true);
  });

  it("rejects more than 2000 seats per generation, accepts exactly 2000", () => {
    expect(getSeatGeneratorErrors({ rows: "21", seatsPerRow: "100" }).seatsPerRow).toMatch(/2000/);
    expect(seatGeneratorSchema.safeParse({ rows: "20", seatsPerRow: "100" }).success).toBe(true);
    expect(seatGeneratorSchema.safeParse({ rows: "40", seatsPerRow: "50" }).success).toBe(true);
    expect(getSeatGeneratorErrors({ rows: "50", seatsPerRow: "50" }).seatsPerRow).toBeDefined();
  });

  it.each(["a", "AAA", "1", "A1", " ", "a1", "Ñ"])("rejects first row label %j", (firstRowLabel) => {
    const errors = getSeatGeneratorErrors({ rows: "5", seatsPerRow: "10", firstRowLabel });
    // A blank label means "use the default", so only the others are errors.
    if (firstRowLabel.trim() === "") expect(errors.firstRowLabel).toBeUndefined();
    else expect(errors.firstRowLabel).toBeDefined();
  });

  it("accepts one or two uppercase letters", () => {
    expect(seatGeneratorSchema.safeParse({ rows: "2", seatsPerRow: "2", firstRowLabel: "Z" }).success).toBe(true);
    expect(seatGeneratorSchema.safeParse({ rows: "2", seatsPerRow: "2", firstRowLabel: "AB" }).success).toBe(true);
  });

  it("rejects rows that would run past ZZ", () => {
    expect(getSeatGeneratorErrors({ rows: "2", seatsPerRow: "2", firstRowLabel: "ZZ" }).firstRowLabel).toBeDefined();
    expect(seatGeneratorSchema.safeParse({ rows: "1", seatsPerRow: "2", firstRowLabel: "ZZ" }).success).toBe(true);
  });

  it.each(["0", "-1", "1.5", "abc", "100001"])("rejects start number %j", (startNumber) => {
    expect(getSeatGeneratorErrors({ rows: "5", seatsPerRow: "10", startNumber }).startNumber).toBeDefined();
  });
});
