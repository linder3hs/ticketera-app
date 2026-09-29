import { describe, expect, it } from "vitest";

import {
  formatEventDateParts,
  formatEventPrice,
} from "@/modules/event/event.utils";

describe("formatEventDateParts", () => {
  it("splits an ISO date into chip, short and long labels", () => {
    expect(formatEventDateParts("2026-11-14")).toEqual({
      day: "14",
      month: "NOV",
      short: "sáb 14 nov",
      long: "sábado 14 de noviembre",
    });
  });

  it("does not shift the day due to timezone conversion (UTC formatting)", () => {
    // Midnight of the 1st is the trickiest case for an off-by-one day bug
    // in timezones behind UTC (e.g. Lima, UTC-5): if the formatter used the
    // local timezone instead of UTC, this would render as the last day of
    // the previous month.
    expect(formatEventDateParts("2026-12-01")).toEqual({
      day: "01",
      month: "DIC",
      short: "mar 1 dic",
      long: "martes 1 de diciembre",
    });
  });
});

describe("formatEventPrice", () => {
  it("formats a PEN price with the sol currency symbol and no decimals", () => {
    const result = formatEventPrice(250, "PEN");
    expect(result).toContain("S/");
    expect(result).toContain("250");
  });

  it("formats prices in other currencies (e.g. USD)", () => {
    const result = formatEventPrice(150, "USD");
    expect(result).toContain("150");
  });
});
