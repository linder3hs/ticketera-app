import { describe, expect, it } from "vitest";
import {
  getCategories,
  getFeaturedEvents,
  getUpcomingEvents,
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
