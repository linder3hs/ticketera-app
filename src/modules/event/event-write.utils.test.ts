import { describe, expect, it } from "vitest";

import { formatCents, nextAvailableSlug, parsePriceToCents, sameMinute, toStartsAt } from "@/modules/event/event-write.utils";

describe("parsePriceToCents", () => {
  it.each([
    ["120", 12000],
    ["120.5", 12050],
    ["0.1", 10],
    ["19.99", 1999],
    ["0", 0],
    [" 8.05 ", 805],
  ])("parses %j as %i cents", (price, cents) => {
    expect(parsePriceToCents(price)).toBe(cents);
  });

  it.each(["", "abc", "1.234", "-5", "1,50", ".5", "5.", "1e3"])("rejects %j", (price) => {
    expect(parsePriceToCents(price)).toBeNull();
  });
});

describe("toStartsAt", () => {
  it("reads the date and time in Lima (UTC-5)", () => {
    expect(toStartsAt("2027-01-15", "20:30").toISOString()).toBe("2027-01-16T01:30:00.000Z");
    expect(toStartsAt("2027-06-01", "00:00").toISOString()).toBe("2027-06-01T05:00:00.000Z");
  });

  it("gives an Invalid Date for an impossible month", () => {
    expect(Number.isNaN(toStartsAt("2027-13-01", "10:00").getTime())).toBe(true);
  });
});

describe("nextAvailableSlug", () => {
  it("keeps the base when it is free", () => {
    expect(nextAvailableSlug("rock-fest", [])).toBe("rock-fest");
    expect(nextAvailableSlug("rock-fest", ["rock-fest-2", "other"])).toBe("rock-fest");
  });

  it("suffixes from -2 on collision", () => {
    expect(nextAvailableSlug("rock-fest", ["rock-fest"])).toBe("rock-fest-2");
    expect(nextAvailableSlug("rock-fest", new Set(["rock-fest", "rock-fest-2"]))).toBe("rock-fest-3");
  });

  it("fills the first gap", () => {
    expect(nextAvailableSlug("rock-fest", ["rock-fest", "rock-fest-3"])).toBe("rock-fest-2");
  });

  it("falls back to a generic slug for an empty base", () => {
    expect(nextAvailableSlug("", [])).toBe("event");
    expect(nextAvailableSlug("", ["event"])).toBe("event-2");
  });
});

describe("formatCents", () => {
  it.each([
    [1999, "19.99"],
    [12000, "120"],
    [5, "0.05"],
    [0, "0"],
    [12050, "120.50"],
  ])("formats %i as %s", (cents, price) => {
    expect(formatCents(cents)).toBe(price);
  });

  it.each([0, 5, 10, 99, 100, 805, 1999, 12000, 12050])("round-trips %i through parsePriceToCents", (cents) => {
    expect(parsePriceToCents(formatCents(cents))).toBe(cents);
  });
});

describe("sameMinute", () => {
  it("is true within the same minute, whatever the seconds and milliseconds", () => {
    expect(sameMinute(new Date("2026-10-02T20:00:00.000Z"), new Date("2026-10-02T20:00:59.999Z"))).toBe(true);
  });

  it("is false across a minute boundary", () => {
    expect(sameMinute(new Date("2026-10-02T20:00:59.999Z"), new Date("2026-10-02T20:01:00.000Z"))).toBe(false);
    expect(sameMinute(new Date("2026-10-02T20:00:00Z"), new Date("2026-10-02T21:00:00Z"))).toBe(false);
  });
});
