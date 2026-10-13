import { describe, expect, it } from "vitest";

import type { MonthlyPoint } from "@/modules/admin/admin-metrics.types";
import {
  PROJECTION_MONTHS,
  SERIES_MONTHS,
  followingMonths,
  formatMonthLabel,
  isEmptySeries,
  projectLinear,
  recentMonths,
  splitForChart,
  toMonthlySeries,
} from "@/modules/admin/admin-series.utils";

const MONTHS = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];

describe("window sizes", () => {
  it("shows 6 real months and projects 3", () => {
    expect(SERIES_MONTHS).toBe(6);
    expect(PROJECTION_MONTHS).toBe(3);
  });
});

describe("recentMonths", () => {
  it("returns the 6 months ending in the current one, oldest first", () => {
    expect(recentMonths(new Date("2026-10-12T12:00:00Z"), 6)).toEqual(MONTHS);
  });

  it("uses Lima's month: 2026-11-01T03:00Z is still October 31 in Lima", () => {
    const months = recentMonths(new Date("2026-11-01T03:00:00Z"), 6);
    expect(months.at(-1)).toBe("2026-10");
    expect(months).toEqual(MONTHS);
  });

  it("crosses the year", () => {
    expect(recentMonths(new Date("2026-02-15T12:00:00Z"), 6)).toEqual([
      "2025-09",
      "2025-10",
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
  });
});

describe("followingMonths", () => {
  it("returns the next months, crossing the year", () => {
    expect(followingMonths("2026-11", 3)).toEqual(["2026-12", "2027-01", "2027-02"]);
  });
});

describe("formatMonthLabel", () => {
  it("is the short month and year in Spanish, without the dot and lowercased", () => {
    expect(formatMonthLabel("2026-10")).toBe("oct 2026");
    expect(formatMonthLabel("2027-01")).toBe("ene 2027");
  });
});

describe("projectLinear", () => {
  it("keeps a flat series flat", () => {
    expect(projectLinear([10, 10, 10, 10, 10, 10], 3)).toEqual([10, 10, 10]);
  });

  it("extends a growing trend", () => {
    expect(projectLinear([10, 20, 30, 40, 50, 60], 3)).toEqual([70, 80, 90]);
  });

  it("never goes below 0 on a falling trend", () => {
    expect(projectLinear([70, 60, 50, 40, 30, 20], 3)).toEqual([10, 0, 0]);
  });

  it("counts zero months as observations and rounds", () => {
    expect(projectLinear([0, 0, 0, 0, 10, 20], 3)).toEqual([18, 22, 25]);
  });

  it("does not project a single month with data", () => {
    expect(projectLinear([0, 0, 0, 0, 0, 7], 3)).toEqual([]);
  });

  it("does not project an all-zero series", () => {
    expect(projectLinear([0, 0, 0, 0, 0, 0], 3)).toEqual([]);
  });

  it("does not project an empty series", () => {
    expect(projectLinear([], 3)).toEqual([]);
  });
});

describe("toMonthlySeries", () => {
  it("appends the projection over the following months", () => {
    const series = toMonthlySeries(MONTHS, [0, 0, 0, 0, 10, 20]);

    expect(series).toHaveLength(9);
    expect(series.map((point) => point.month)).toEqual([...MONTHS, "2026-11", "2026-12", "2027-01"]);
    expect(series.map((point) => point.value)).toEqual([0, 0, 0, 0, 10, 20, 18, 22, 25]);
    expect(series.map((point) => point.projected)).toEqual([false, false, false, false, false, false, true, true, true]);
    expect(series[5].label).toBe("oct 2026");
    expect(series[8].label).toBe("ene 2027");
    expect(series.every((point) => point.label.length > 0)).toBe(true);
  });

  it("has only the real points when there is nothing to project", () => {
    const series = toMonthlySeries(MONTHS, [0, 0, 0, 0, 0, 7]);

    expect(series).toHaveLength(6);
    expect(series.every((point) => !point.projected)).toBe(true);
    expect(series.at(-1)).toEqual({ month: "2026-10", label: "oct 2026", value: 7, projected: false });
  });
});

describe("isEmptySeries", () => {
  it("is true when every real point is 0", () => {
    expect(isEmptySeries(toMonthlySeries(MONTHS, [0, 0, 0, 0, 0, 0]))).toBe(true);
  });

  it("is false when a real point is above 0", () => {
    expect(isEmptySeries(toMonthlySeries(MONTHS, [0, 0, 0, 0, 0, 7]))).toBe(false);
  });
});

describe("splitForChart", () => {
  const projectedSeries: MonthlyPoint[] = toMonthlySeries(MONTHS, [0, 0, 0, 0, 10, 20]);

  it("starts the projection at the last real point when bridging", () => {
    const { actual, projected } = splitForChart(projectedSeries, { bridge: true });

    expect(actual.map((datum) => datum.id)).toEqual(MONTHS);
    expect(projected.map((datum) => datum.id)).toEqual(["2026-10-bridge", "2026-11", "2026-12", "2027-01"]);
    expect(projected[0]).toEqual({ id: "2026-10-bridge", label: "oct 2026", value: 20 });
    expect(actual.filter((datum) => datum.id.endsWith("-bridge"))).toEqual([]);
  });

  it("does not repeat any month without a bridge", () => {
    const { actual, projected } = splitForChart(projectedSeries, { bridge: false });

    expect(actual).toHaveLength(6);
    expect(projected.map((datum) => datum.id)).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(projected.map((datum) => datum.value)).toEqual([18, 22, 25]);
  });

  it("leaves the projection empty when there is none", () => {
    const { actual, projected } = splitForChart(toMonthlySeries(MONTHS, [0, 0, 0, 0, 0, 7]), { bridge: true });

    expect(actual).toHaveLength(6);
    expect(projected).toEqual([]);
  });
});
