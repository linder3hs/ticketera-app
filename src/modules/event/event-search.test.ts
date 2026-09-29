import { describe, expect, it } from "vitest";

import {
  EMPTY_FILTERS,
  filterEvents,
  getActiveFilterChips,
  getFacetCounts,
  getMonthOptions,
  parseSearchParams,
  sortEvents,
  toSearchHref,
  toSearchParams,
} from "@/modules/event/event-search";
import type { Event, EventCategory } from "@/modules/event/event.types";

function event(overrides: Partial<Event>): Event {
  return {
    id: "evt",
    title: "Evento",
    category: "Conciertos",
    imageUrl: "",
    imageAlt: "",
    date: "2026-10-01",
    venue: "Lugar",
    city: "Lima",
    priceFrom: 100,
    currency: "PEN",
    status: "available",
    featured: false,
    ...overrides,
  };
}

const CATEGORIES: EventCategory[] = [
  { id: "cat-conciertos", label: "Conciertos", icon: "Music" },
  { id: "cat-teatro", label: "Teatro", icon: "Theater" },
];

const EVENTS = [
  event({ id: "a", title: "Concierto en Bogotá", date: "2026-11-10", priceFrom: 250 }),
  event({ id: "b", title: "Obra", category: "Teatro", city: "Arequipa", date: "2026-10-05", priceFrom: 40 }),
  event({ id: "c", title: "Otro show", venue: "Estadio Nacional", date: "2026-12-01", priceFrom: 150 }),
];

const ids = (events: Event[]) => events.map((item) => item.id);

describe("event-search", () => {
  describe("parseSearchParams / toSearchParams", () => {
    it("reads every filter, keeping repeated values once", () => {
      expect(
        parseSearchParams({
          q: " rock ",
          categoria: ["cat-teatro", "cat-teatro", "cat-conciertos"],
          ciudad: "Lima",
          mes: "2026-11",
          precio: "50-150",
          desde: "2026-10-20",
          orden: "price",
        }),
      ).toEqual({
        q: "rock",
        categories: ["cat-teatro", "cat-conciertos"],
        cities: ["Lima"],
        month: "2026-11",
        price: "50-150",
        from: "2026-10-20",
        sort: "price",
      });
    });

    it("drops empty and invalid values", () => {
      expect(parseSearchParams({ q: "", mes: "noviembre", precio: "gratis", desde: "ayer", orden: "x" })).toEqual(
        EMPTY_FILTERS,
      );
    });

    it("round-trips through the URL and omits defaults", () => {
      const filters = { ...EMPTY_FILTERS, categories: ["cat-teatro"], cities: ["Lima", "Arequipa"], price: "over-300" as const };
      const params = toSearchParams(filters);
      expect(params.toString()).toBe("categoria=cat-teatro&ciudad=Lima&ciudad=Arequipa&precio=over-300");
      expect(parseSearchParams(Object.fromEntries([...new Set(params.keys())].map((key) => [key, params.getAll(key)])))).toEqual(filters);
      expect(toSearchHref(EMPTY_FILTERS)).toBe("/events");
    });
  });

  describe("filterEvents", () => {
    it("matches text in title, venue or city ignoring case and accents", () => {
      expect(ids(filterEvents(EVENTS, { ...EMPTY_FILTERS, q: "BOGOTA" }, CATEGORIES))).toEqual(["a"]);
      expect(ids(filterEvents(EVENTS, { ...EMPTY_FILTERS, q: "estadio" }, CATEGORIES))).toEqual(["c"]);
      expect(ids(filterEvents(EVENTS, { ...EMPTY_FILTERS, q: "arequipa" }, CATEGORIES))).toEqual(["b"]);
    });

    it("ORs values within a facet and ANDs facets", () => {
      const both = { ...EMPTY_FILTERS, categories: ["cat-conciertos", "cat-teatro"] };
      expect(ids(filterEvents(EVENTS, both, CATEGORIES))).toEqual(["a", "b", "c"]);
      expect(ids(filterEvents(EVENTS, { ...both, cities: ["Arequipa"] }, CATEGORIES))).toEqual(["b"]);
    });

    it("filters by month, price range and start date", () => {
      expect(ids(filterEvents(EVENTS, { ...EMPTY_FILTERS, month: "2026-12" }, CATEGORIES))).toEqual(["c"]);
      expect(ids(filterEvents(EVENTS, { ...EMPTY_FILTERS, price: "under-50" }, CATEGORIES))).toEqual(["b"]);
      expect(ids(filterEvents(EVENTS, { ...EMPTY_FILTERS, price: "50-150" }, CATEGORIES))).toEqual(["c"]);
      expect(ids(filterEvents(EVENTS, { ...EMPTY_FILTERS, from: "2026-11-10" }, CATEGORIES))).toEqual(["a", "c"]);
    });
  });

  describe("sortEvents", () => {
    it("sorts by date or by lowest price", () => {
      expect(ids(sortEvents(EVENTS, "date"))).toEqual(["b", "a", "c"]);
      expect(ids(sortEvents(EVENTS, "price"))).toEqual(["b", "c", "a"]);
    });
  });

  describe("getFacetCounts / getMonthOptions / getActiveFilterChips", () => {
    it("counts events per category and city", () => {
      expect(getFacetCounts(EVENTS, CATEGORIES)).toEqual({
        categories: { "cat-conciertos": 2, "cat-teatro": 1 },
        cities: { Lima: 2, Arequipa: 1 },
      });
    });

    it("lists the months with events", () => {
      expect(getMonthOptions(EVENTS)).toEqual([
        { key: "2026-10", label: "Octubre" },
        { key: "2026-11", label: "Noviembre" },
        { key: "2026-12", label: "Diciembre" },
      ]);
    });

    it("builds one removable chip per active filter", () => {
      const filters = { ...EMPTY_FILTERS, q: "rock", categories: ["cat-teatro"], month: "2026-10", price: "50-150" as const };
      const chips = getActiveFilterChips(filters, CATEGORIES, getMonthOptions(EVENTS));
      expect(chips.map((chip) => chip.label)).toEqual(["“rock”", "Teatro", "Octubre", "S/ 50 – 150"]);
      expect(chips[1].filters.categories).toEqual([]);
      expect(chips[1].filters.q).toBe("rock");
    });
  });
});
