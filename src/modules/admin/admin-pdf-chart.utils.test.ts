import { describe, expect, it } from "vitest";

import type { MonthlyPoint } from "@/modules/admin/admin-metrics.types";
import {
  barRect,
  columnCenterX,
  niceTicks,
  projectionBandRect,
  scaleY,
  type PlotFrame,
} from "@/modules/admin/admin-pdf-chart.utils";

function point(month: string, value: number, projected: boolean): MonthlyPoint {
  return { month, label: month, value, projected };
}

const ACTUAL = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"].map((month, i) =>
  point(month, (i + 1) * 100, false),
);
const PROJECTED = ["2026-11", "2026-12", "2027-01"].map((month, i) => point(month, (i + 7) * 100, true));

describe("niceTicks", () => {
  it.each([
    [980, 1, [0, 200, 400, 600, 800, 1000]],
    [1000, 1, [0, 200, 400, 600, 800, 1000]],
    [7, 1, [0, 2, 4, 6, 8]],
    [3, 1, [0, 1, 2, 3]],
    [1_234_567, 100, [0, 500000, 1000000, 1500000]],
    [45_000, 100, [0, 10000, 20000, 30000, 40000, 50000]],
  ])("(%d, { minStep: %d }) → %j", (max, minStep, expected) => {
    expect(niceTicks(max, { minStep })).toEqual(expected);
  });

  it.each([0, -5, -Infinity, Infinity, NaN])("treats max %d as 1 → [0, 1]", (max) => {
    expect(niceTicks(max, { minStep: 1 })).toEqual([0, 1]);
  });

  it("never steps below minStep", () => {
    expect(niceTicks(250, { minStep: 100 })).toEqual([0, 100, 200, 300]);
  });

  it("splits in at most `count` parts when given", () => {
    expect(niceTicks(10, { minStep: 1, count: 2 })).toEqual([0, 5, 10]);
  });
});

describe("scaleY", () => {
  const frame: PlotFrame = { left: 0, top: 10, width: 100, height: 50 };

  it("maps 0 to the bottom edge and domainMax to the top edge (y grows downwards)", () => {
    expect(scaleY(0, 1000, frame)).toBe(60);
    expect(scaleY(1000, 1000, frame)).toBe(10);
    expect(scaleY(500, 1000, frame)).toBe(35);
  });

  it("treats a domainMax ≤ 0 or not finite as 1, never NaN", () => {
    expect(scaleY(0, 0, frame)).toBe(60);
    expect(scaleY(1, 0, frame)).toBe(10);
    expect(scaleY(1, -5, frame)).toBe(10);
    expect(scaleY(1, NaN, frame)).toBe(10);
  });
});

describe("columnCenterX", () => {
  const frame: PlotFrame = { left: 20, top: 0, width: 144, height: 50 };

  it("centers each of 9 columns of 16", () => {
    expect(columnCenterX(0, 9, frame)).toBe(28);
    expect(columnCenterX(8, 9, frame)).toBe(156);
  });

  it("centers each of 6 columns of 24", () => {
    expect(columnCenterX(0, 6, frame)).toBe(32);
    expect(columnCenterX(5, 6, frame)).toBe(152);
  });
});

describe("barRect", () => {
  const frame: PlotFrame = { left: 0, top: 10, width: 100, height: 50 };

  it("is 60 % of its column wide, centered on columnCenterX, from scaleY down to the base", () => {
    expect(barRect(1, 5, 500, 1000, frame)).toEqual({ x: 24, y: 35, width: 12, height: 25 });
  });

  it("keeps the 60 % width centered with uneven columns", () => {
    const frame144: PlotFrame = { left: 20, top: 10, width: 144, height: 50 };
    const rect = barRect(0, 6, 1000, 1000, frame144);

    expect(rect.width).toBeCloseTo(14.4);
    expect(rect.x + rect.width / 2).toBeCloseTo(columnCenterX(0, 6, frame144));
    expect(rect.y).toBe(10);
    expect(rect.height).toBe(50);
  });

  it("has height 0 at the base for a value of 0", () => {
    expect(barRect(0, 5, 0, 1000, frame)).toMatchObject({ y: 60, height: 0 });
  });

  it("treats a domainMax ≤ 0 as 1, never NaN", () => {
    expect(barRect(0, 5, 0, 0, frame)).toMatchObject({ y: 60, height: 0 });
  });

  it("never has a negative height", () => {
    expect(barRect(0, 5, -50, 1000, frame)).toMatchObject({ y: 60, height: 0 });
  });
});

describe("projectionBandRect", () => {
  const frame: PlotFrame = { left: 20, top: 10, width: 144, height: 50 };

  it("covers the columns of the projected points, full height", () => {
    expect(projectionBandRect([...ACTUAL, ...PROJECTED], frame)).toEqual({ x: 116, y: 10, width: 48, height: 50 });
  });

  it("returns null without projected points", () => {
    expect(projectionBandRect(ACTUAL, frame)).toBeNull();
    expect(projectionBandRect([], frame)).toBeNull();
  });
});
