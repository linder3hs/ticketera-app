import { describe, expect, it } from "vitest";

import { createEventWriteSchema, getEventWriteErrors } from "@/modules/event/event-write.schema";
import type { EventFormValues } from "@/modules/event/event-write.types";

/** 2026-10-02 10:00 in Lima. */
const NOW = new Date("2026-10-02T15:00:00Z");

const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";
const VENUE_ID = "22222222-2222-4222-8222-222222222222";
const ZONE_A = "33333333-3333-4333-8333-333333333333";
const ZONE_B = "44444444-4444-4444-8444-444444444444";

const VALID: EventFormValues = {
  title: "Festival de verano",
  description: "",
  categoryId: CATEGORY_ID,
  venueId: VENUE_ID,
  date: "2026-12-15",
  time: "20:00",
  coverImageUrl: "",
  zones: [{ venueZoneId: ZONE_A, price: "120", capacity: "500" }],
};

const withZone = (zone: Partial<EventFormValues["zones"][number]>): EventFormValues => ({
  ...VALID,
  zones: [{ ...VALID.zones[0], ...zone }],
});

describe("createEventWriteSchema", () => {
  it("parses form strings into domain types", () => {
    const result = createEventWriteSchema("draft", NOW).safeParse({
      ...VALID,
      title: "  Festival de verano  ",
      description: "  Dos días de música  ",
      coverImageUrl: " https://example.com/cover.jpg ",
      zones: [
        { venueZoneId: ZONE_A, price: "19.99", capacity: "500" },
        { venueZoneId: ZONE_B, price: "250", capacity: "" },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      title: "Festival de verano",
      description: "Dos días de música",
      categoryId: CATEGORY_ID,
      venueId: VENUE_ID,
      startsAt: new Date("2026-12-16T01:00:00.000Z"),
      coverImageUrl: "https://example.com/cover.jpg",
      zones: [
        { venueZoneId: ZONE_A, priceCents: 1999, capacity: 500 },
        { venueZoneId: ZONE_B, priceCents: 25000, capacity: null },
      ],
    });
  });

  it("turns an empty description and cover into null", () => {
    const result = createEventWriteSchema("draft", NOW).safeParse(VALID);
    expect(result.data).toMatchObject({ description: null, coverImageUrl: null });
  });

  it("drops a zone without a price instead of failing", () => {
    const result = createEventWriteSchema("draft", NOW).safeParse({
      ...VALID,
      zones: [
        { venueZoneId: ZONE_A, price: "", capacity: "abc" },
        { venueZoneId: ZONE_B, price: "80", capacity: "" },
      ],
    });
    expect(result.data?.zones).toEqual([{ venueZoneId: ZONE_B, priceCents: 8000, capacity: null }]);
  });
});

describe("getEventWriteErrors", () => {
  it("accepts a draft without zones, but not a publish", () => {
    const noZones = { ...VALID, zones: [] };
    expect(getEventWriteErrors(noZones, "draft", NOW)).toEqual({});
    expect(getEventWriteErrors(noZones, "publish", NOW)).toEqual({ zones: "Agrega al menos una zona con precio." });
    expect(getEventWriteErrors(withZone({ price: "" }), "publish", NOW)).toEqual({
      zones: "Agrega al menos una zona con precio.",
    });
    expect(getEventWriteErrors(VALID, "publish", NOW)).toEqual({});
  });

  it("asks a draft for the basics", () => {
    const errors = getEventWriteErrors(
      { ...VALID, title: "", categoryId: "", venueId: "", date: "", time: "", zones: [] },
      "draft",
      NOW,
    );
    expect(Object.keys(errors).sort()).toEqual(["categoryId", "date", "time", "title", "venueId"]);
  });

  it("requires a title of at least 3 characters once trimmed", () => {
    expect(getEventWriteErrors({ ...VALID, title: "  ab  " }, "draft", NOW)).toEqual({
      title: "Escribe el nombre del evento (mínimo 3 caracteres).",
    });
    expect(getEventWriteErrors({ ...VALID, title: " abc " }, "draft", NOW)).toEqual({});
  });

  it("rejects a past date on the date field", () => {
    expect(getEventWriteErrors({ ...VALID, date: "2026-10-01" }, "draft", NOW)).toEqual({
      date: "La fecha y hora deben ser futuras.",
    });
  });

  it("rejects today with a past hour on the time field, and accepts a later hour", () => {
    expect(getEventWriteErrors({ ...VALID, date: "2026-10-02", time: "09:59" }, "draft", NOW)).toEqual({
      time: "La fecha y hora deben ser futuras.",
    });
    expect(getEventWriteErrors({ ...VALID, date: "2026-10-02", time: "10:00" }, "draft", NOW)).toEqual({
      time: "La fecha y hora deben ser futuras.",
    });
    expect(getEventWriteErrors({ ...VALID, date: "2026-10-02", time: "10:01" }, "draft", NOW)).toEqual({});
  });

  it("uses the Lima day, not the UTC one, for 'today'", () => {
    // 2026-10-03 02:00 UTC is still 2026-10-02 21:00 in Lima.
    const lateNight = new Date("2026-10-03T02:00:00Z");
    expect(getEventWriteErrors({ ...VALID, date: "2026-10-02", time: "20:00" }, "draft", lateNight)).toEqual({
      time: "La fecha y hora deben ser futuras.",
    });
    expect(getEventWriteErrors({ ...VALID, date: "2026-10-02", time: "21:30" }, "draft", lateNight)).toEqual({});
  });

  it.each([
    ["2027-02-30", "10:00", "date"],
    ["2027-13-01", "10:00", "date"],
    ["15/12/2026", "10:00", "date"],
    ["2026-12-15", "24:00", "time"],
    ["2026-12-15", "9:00", "time"],
  ])("rejects the malformed date/time %s %s", (date, time, field) => {
    expect(Object.keys(getEventWriteErrors({ ...VALID, date, time }, "draft", NOW))).toEqual([field]);
  });

  it.each(["0", "0.00", "1.234", "abc", "-5", "99999999999"])("rejects the price %j", (price) => {
    expect(Object.keys(getEventWriteErrors(withZone({ price }), "draft", NOW))).toEqual(["zones.0.price"]);
  });

  it.each(["1", "0.1", "19.99", "120.5"])("accepts the price %j", (price) => {
    expect(getEventWriteErrors(withZone({ price }), "draft", NOW)).toEqual({});
  });

  it.each(["0", "-1", "1.5", "abc", "99999999999"])("rejects the capacity %j", (capacity) => {
    expect(Object.keys(getEventWriteErrors(withZone({ capacity }), "draft", NOW))).toEqual(["zones.0.capacity"]);
  });

  it("keeps the original index of a zone error when earlier zones are dropped", () => {
    const errors = getEventWriteErrors(
      {
        ...VALID,
        zones: [
          { venueZoneId: ZONE_A, price: "", capacity: "" },
          { venueZoneId: ZONE_B, price: "abc", capacity: "" },
        ],
      },
      "draft",
      NOW,
    );
    expect(Object.keys(errors)).toEqual(["zones.1.price"]);
  });

  it("rejects a zone listed twice", () => {
    const errors = getEventWriteErrors(
      { ...VALID, zones: [VALID.zones[0], { venueZoneId: ZONE_A, price: "50", capacity: "" }] },
      "draft",
      NOW,
    );
    expect(errors).toEqual({ "zones.1.venueZoneId": "Zona repetida." });
  });

  it("rejects ids that are not UUIDs", () => {
    const errors = getEventWriteErrors(
      { ...VALID, categoryId: "cat-1", venueId: "venue-1", zones: [{ venueZoneId: "zone-1", price: "10", capacity: "" }] },
      "draft",
      NOW,
    );
    expect(Object.keys(errors).sort()).toEqual(["categoryId", "venueId", "zones.0.venueZoneId"]);
  });

  it.each(["http://example.com/a.jpg", "data:image/jpeg;base64,AAAA", "ftp://example.com/a.jpg", "not a url", "javascript:alert(1)"])(
    "rejects the cover %j",
    (coverImageUrl) => {
      expect(getEventWriteErrors({ ...VALID, coverImageUrl }, "draft", NOW)).toEqual({
        coverImageUrl: "La portada debe ser una URL https.",
      });
    },
  );

  it("accepts an https cover and an empty one", () => {
    expect(getEventWriteErrors({ ...VALID, coverImageUrl: "https://images.unsplash.com/photo-1" }, "draft", NOW)).toEqual({});
    expect(getEventWriteErrors({ ...VALID, coverImageUrl: "   " }, "draft", NOW)).toEqual({});
  });
});
