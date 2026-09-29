import { describe, expect, it } from "vitest";

import { getOrganizerEvents, getOrganizerKpis } from "@/modules/organizer/services/organizer-service";
import type { OrganizerEvent } from "@/modules/organizer/organizer.types";

const event = (overrides: Partial<OrganizerEvent>): OrganizerEvent => ({
  id: "e",
  title: "Evento",
  category: "Conciertos",
  imageUrl: "",
  date: "2026-10-01",
  venue: "",
  city: "",
  sold: 0,
  capacity: 100,
  priceFrom: 10,
  currency: "PEN",
  status: "published",
  ...overrides,
});

describe("organizer-service", () => {
  it("returns the sample events with sales, soonest first", async () => {
    const events = await getOrganizerEvents();
    expect(events).toHaveLength(4);
    expect(events.map((item) => item.date)).toEqual([...events.map((item) => item.date)].sort());
    expect(events.every((item) => item.sold <= item.capacity)).toBe(true);
  });

  it("adds up sold tickets, revenue and published events, skipping drafts", () => {
    expect(
      getOrganizerKpis([
        event({ sold: 10, priceFrom: 20 }),
        event({ sold: 5, priceFrom: 100 }),
        event({ sold: 99, priceFrom: 99, status: "draft" }),
      ]),
    ).toEqual({ sold: 15, revenue: 700, published: 2 });
  });
});
