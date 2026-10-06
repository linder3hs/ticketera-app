import { describe, expect, it } from "vitest";

import {
  availabilityStatus,
  summarizeZones,
  toPublicEvents,
  type PublicEventRow,
  type PublicZoneRow,
} from "@/modules/event/event-public.utils";

const row = (overrides: Partial<PublicEventRow> = {}): PublicEventRow => ({
  id: "a",
  title: "Bad Bunny — World Tour",
  coverImageUrl: "https://cdn.example.com/cover.jpg",
  coverAlt: "Multitud frente al escenario",
  startsAt: new Date("2026-11-20T20:00:00Z"),
  featured: true,
  currency: "PEN",
  category: "Conciertos",
  venue: "Estadio Nacional",
  city: "Lima",
  ...overrides,
});

const zone = (overrides: Partial<PublicZoneRow> = {}): PublicZoneRow => ({
  eventId: "a",
  priceCents: 10000,
  capacity: 100,
  occupied: 0,
  ...overrides,
});

describe("availabilityStatus", () => {
  it("is available while more than 10% is left", () => {
    expect(availabilityStatus(100, 89)).toBe("available");
  });

  it("is last-tickets when 10% or less is left", () => {
    expect(availabilityStatus(100, 90)).toBe("last-tickets");
  });

  it("is sold-out when nothing is left", () => {
    expect(availabilityStatus(100, 100)).toBe("sold-out");
  });

  it("is sold-out without capacity", () => {
    expect(availabilityStatus(0, 0)).toBe("sold-out");
  });

  it("is sold-out when occupancy exceeds capacity", () => {
    expect(availabilityStatus(100, 120)).toBe("sold-out");
  });
});

describe("summarizeZones", () => {
  it("adds up GA and numbered zones per event, with the cheapest price", () => {
    const result = summarizeZones([
      // GA zone of "a"
      zone({ eventId: "a", priceCents: 25000, capacity: 300, occupied: 10 }),
      zone({ eventId: "b", priceCents: 5000, capacity: 50, occupied: 50 }),
      // Numbered zone of "a": capacity = its seats, occupancy = sold + held seats
      zone({ eventId: "a", priceCents: 12000, capacity: 40, occupied: 5 }),
      zone({ eventId: "a", priceCents: 18000, capacity: 60, occupied: 0 }),
    ]);

    expect(result.get("a")).toEqual({ minPriceCents: 12000, capacity: 400, occupied: 15 });
    expect(result.get("b")).toEqual({ minPriceCents: 5000, capacity: 50, occupied: 50 });
    expect(result.get("c")).toBeUndefined();
  });
});

describe("toPublicEvents", () => {
  it("maps a row and its zones to the public event", () => {
    const [event] = toPublicEvents(
      [row()],
      [zone({ priceCents: 25050, capacity: 60, occupied: 30 }), zone({ priceCents: 12000, capacity: 40, occupied: 0 })],
    );

    expect(event).toEqual({
      id: "a",
      title: "Bad Bunny — World Tour",
      category: "Conciertos",
      imageUrl: "https://cdn.example.com/cover.jpg",
      imageAlt: "Multitud frente al escenario",
      date: "2026-11-20",
      venue: "Estadio Nacional",
      city: "Lima",
      priceFrom: 120,
      currency: "PEN",
      status: "available",
      featured: true,
    });
  });

  it("turns price cents into units", () => {
    const [event] = toPublicEvents([row()], [zone({ priceCents: 4550 })]);
    expect(event.priceFrom).toBe(45.5);
  });

  it("uses an empty image URL without a cover and the title without an alt", () => {
    const [event] = toPublicEvents([row({ coverImageUrl: null, coverAlt: null })], [zone()]);
    expect(event.imageUrl).toBe("");
    expect(event.imageAlt).toBe("Bad Bunny — World Tour");
  });

  it("uses Lima's calendar day for an early-morning UTC instant", () => {
    const [event] = toPublicEvents([row({ startsAt: new Date("2026-11-15T01:30:00Z") })], [zone()]);
    expect(event.date).toBe("2026-11-14");
  });

  it("derives the status from all the event's zones together", () => {
    const [event] = toPublicEvents(
      [row()],
      [zone({ capacity: 60, occupied: 60 }), zone({ capacity: 40, occupied: 30 })],
    );
    expect(event.status).toBe("last-tickets");
  });

  it("marks an event without zones as sold out from 0", () => {
    const [event] = toPublicEvents([row()], []);
    expect(event.status).toBe("sold-out");
    expect(event.priceFrom).toBe(0);
  });

  it("keeps the input order and ignores zones of other events", () => {
    const events = toPublicEvents(
      [row({ id: "c" }), row({ id: "a" }), row({ id: "b" })],
      [zone({ eventId: "b", priceCents: 1000 }), zone({ eventId: "z", priceCents: 1 }), zone({ eventId: "a", priceCents: 2000 })],
    );

    expect(events.map((event) => event.id)).toEqual(["c", "a", "b"]);
    expect(events.map((event) => event.priceFrom)).toEqual([0, 20, 10]);
  });
});
