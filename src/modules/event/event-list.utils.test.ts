import { describe, expect, it } from "vitest";

import { aggregateZoneSales, toLimaDate, toLimaTime } from "@/modules/event/event-list.utils";

describe("aggregateZoneSales", () => {
  it("adds sold, capacity and revenue per event", () => {
    const result = aggregateZoneSales([
      { eventId: "a", priceCents: 1000, sold: 2, capacity: 10 },
      { eventId: "a", priceCents: 5000, sold: 1, capacity: 5 },
      { eventId: "b", priceCents: 2000, sold: 0, capacity: 8 },
    ]);
    expect(result.get("a")).toEqual({ sold: 3, capacity: 15, revenueCents: 7000 });
    expect(result.get("b")).toEqual({ sold: 0, capacity: 8, revenueCents: 0 });
    expect(result.get("c")).toBeUndefined();
  });
});

describe("toLimaDate", () => {
  it("uses Lima's calendar day, not UTC's", () => {
    expect(toLimaDate(new Date("2026-11-15T01:00:00Z"))).toBe("2026-11-14");
  });
});

describe("toLimaTime", () => {
  it("reads the instant in Lima (UTC-5)", () => {
    expect(toLimaTime(new Date("2026-10-02T20:30:00Z"))).toBe("15:30");
  });

  it("gives 00:00 at Lima midnight, never 24:00", () => {
    expect(toLimaTime(new Date("2026-10-02T05:00:00Z"))).toBe("00:00");
    expect(toLimaTime(new Date("2026-10-02T05:30:00Z"))).toBe("00:30");
  });

  it("pads single-digit hours", () => {
    expect(toLimaTime(new Date("2026-10-02T14:05:00Z"))).toBe("09:05");
  });
});
