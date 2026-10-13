import { describe, expect, it } from "vitest";

import { buildSeedData } from "@/db/seed-data";

describe("buildSeedData", () => {
  it("turns the mock catalog into consistent seed rows", async () => {
    const { categories, venues, events } = await buildSeedData();
    const categorySlugs = new Set(categories.map((category) => category.slug));

    expect(events).toHaveLength(10);
    expect(new Set(events.map((event) => event.slug)).size).toBe(10);

    for (const event of events) {
      expect(categorySlugs.has(event.categorySlug)).toBe(true);
      expect(venues.has(event.venueKey)).toBe(true);
      expect(Number.isNaN(event.startsAt.getTime())).toBe(false);
      expect(event.doorsOpenAt.getTime()).toBeLessThanOrEqual(event.startsAt.getTime());
      expect(event.zones).toHaveLength(5);

      for (const zone of event.zones) {
        expect(zone.priceCents).toBeGreaterThan(0);
      }
    }
  });

  it("only seeds upcoming events, moving past mock dates forward whole years", async () => {
    const now = new Date("2027-03-01T00:00:00Z");
    const { events } = await buildSeedData(now);

    for (const event of events) {
      expect(event.startsAt.getTime()).toBeGreaterThan(now.getTime());
      expect(event.doorsOpenAt.getTime()).toBeLessThanOrEqual(event.startsAt.getTime());
    }
    expect(events.find((event) => event.title.startsWith("Bad Bunny"))?.startsAt.toISOString()).toBe("2027-11-15T01:30:00.000Z");
  });

  it("gives numbered zones seats and standing zones a capacity", async () => {
    const { venues } = await buildSeedData();
    const [venue] = venues.values();

    for (const zone of venue.zones) {
      if (zone.seatingType === "numbered") {
        expect(zone.capacity).toBeNull();
        expect(zone.seats.length).toBeGreaterThan(0);
      } else {
        expect(zone.capacity).toBeGreaterThan(0);
        expect(zone.seats).toHaveLength(0);
      }
    }
  });

  it("starts the Lima event at 20:30 local time (UTC-5)", async () => {
    const { events } = await buildSeedData();
    const badBunny = events.find((event) => event.title.startsWith("Bad Bunny"));

    expect(badBunny?.startsAt.toISOString()).toBe("2026-11-15T01:30:00.000Z");
  });
});
