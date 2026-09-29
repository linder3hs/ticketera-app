import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS } from "@/modules/event/event-search";
import {
  getCategories,
  getCities,
  getEventById,
  getFeaturedEvents,
  getRelatedEvents,
  getUpcomingEvents,
  searchEvents,
} from "@/modules/event/services/event-service";

const EVENT_KEYS = [
  "id",
  "title",
  "category",
  "imageUrl",
  "imageAlt",
  "date",
  "venue",
  "city",
  "priceFrom",
  "currency",
  "status",
  "featured",
];

const VALID_STATUSES = ["available", "last-tickets", "sold-out"];

describe("event-service", () => {
  describe("getFeaturedEvents", () => {
    it("returns a non-empty array", async () => {
      const events = await getFeaturedEvents();
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThan(0);
    });

    it("only contains events with featured: true", async () => {
      const events = await getFeaturedEvents();
      expect(events.every((event) => event.featured === true)).toBe(true);
    });

    it("returns events with the expected shape", async () => {
      const events = await getFeaturedEvents();
      for (const event of events) {
        expect(Object.keys(event)).toEqual(expect.arrayContaining(EVENT_KEYS));
        expect(VALID_STATUSES).toContain(event.status);
      }
    });
  });

  describe("getUpcomingEvents", () => {
    it("returns a non-empty array", async () => {
      const events = await getUpcomingEvents();
      expect(Array.isArray(events)).toBe(true);
      expect(events.length).toBeGreaterThan(0);
    });

    it("returns events with the expected shape", async () => {
      const events = await getUpcomingEvents();
      for (const event of events) {
        expect(Object.keys(event)).toEqual(expect.arrayContaining(EVENT_KEYS));
        expect(VALID_STATUSES).toContain(event.status);
      }
    });

    it("sorts events by date, soonest first", async () => {
      const dates = (await getUpcomingEvents()).map((event) => event.date);
      expect(dates).toEqual([...dates].sort());
    });

    it("filters by category id", async () => {
      const events = await getUpcomingEvents("cat-conciertos");
      expect(events.length).toBeGreaterThan(0);
      expect(events.every((event) => event.category === "Conciertos")).toBe(true);
    });

    it("returns an empty list for a category without events or an unknown id", async () => {
      expect(await getUpcomingEvents("cat-cine")).toEqual([]);
      expect(await getUpcomingEvents("not-a-category")).toEqual([]);
    });
  });

  describe("getEventById", () => {
    it("returns the event with its detail fields", async () => {
      const event = await getEventById("evt-001");
      expect(event?.title).toBe("Bad Bunny — World Tour");
      expect(Object.keys(event ?? {})).toEqual(
        expect.arrayContaining([
          ...EVENT_KEYS,
          "description",
          "doorsOpenAt",
          "startsAt",
          "minAge",
          "address",
        ]),
      );
    });

    it("has detail fields for every event in the catalog", async () => {
      for (const { id } of await getUpcomingEvents()) {
        expect(await getEventById(id)).toBeDefined();
      }
    });

    it("returns undefined for an unknown id", async () => {
      expect(await getEventById("not-an-event")).toBeUndefined();
    });
  });

  describe("getRelatedEvents", () => {
    it("excludes the current event and respects the limit", async () => {
      const events = await getRelatedEvents("evt-001", 3);
      expect(events).toHaveLength(3);
      expect(events.map((event) => event.id)).not.toContain("evt-001");
    });

    it("lists events of the same category first", async () => {
      const [first] = await getRelatedEvents("evt-001");
      expect(first.category).toBe("Conciertos");
    });
  });

  describe("searchEvents", () => {
    it("returns the whole catalog by date without filters", async () => {
      expect(await searchEvents(EMPTY_FILTERS)).toEqual(await getUpcomingEvents());
    });

    it("applies filters and the price sort", async () => {
      const events = await searchEvents({ ...EMPTY_FILTERS, cities: ["Lima"], sort: "price" });
      expect(events.every((event) => event.city === "Lima")).toBe(true);
      const prices = events.map((event) => event.priceFrom);
      expect(prices).toEqual([...prices].sort((a, b) => a - b));
    });
  });

  describe("getCities", () => {
    it("returns unique cities", async () => {
      const cities = await getCities();
      expect(cities).toContain("Lima");
      expect(new Set(cities).size).toBe(cities.length);
    });
  });

  describe("getCategories", () => {
    it("returns a non-empty array", async () => {
      const categories = await getCategories();
      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBeGreaterThan(0);
    });

    it("returns categories with the expected shape", async () => {
      const categories = await getCategories();
      for (const category of categories) {
        expect(Object.keys(category)).toEqual(
          expect.arrayContaining(["id", "label", "icon"]),
        );
      }
    });
  });
});
