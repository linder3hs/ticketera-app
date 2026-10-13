// Pure chart geometry for the dashboard PDF. Units are abstract (the caller picks them)
// and `y` grows downwards, as in jsPDF; nothing here draws or knows about pages.
import type { MonthlyPoint } from "@/modules/admin/admin-metrics.types";

/** Plot area of a chart: its top-left corner and size. */
export interface PlotFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const NICE_MULTIPLIERS = [1, 2, 5, 10];
/** Share of its column a bar takes, centered in it. */
const BAR_WIDTH_RATIO = 0.6;

/** `value` when it is a positive finite number, 1 otherwise (same as `[0, max || 1]` in the dashboard). */
function positiveOrOne(value: number): number {
  return value > 0 && Number.isFinite(value) ? value : 1;
}

function columnWidth(count: number, frame: PlotFrame): number {
  return frame.width / count;
}

/**
 * Y-axis ticks from 0 to the first "nice" multiple of the step that reaches `max`.
 * The step is the smallest of 1, 2, 5 or 10 × 10^n that splits `max` in at most
 * `count` parts, and never below `minStep` (100 for cents = S/ 1, 1 for counts).
 */
export function niceTicks(max: number, { minStep, count = 5 }: { minStep: number; count?: number }): number[] {
  const m = positiveOrOne(max);
  const raw = m / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const multiplier = NICE_MULTIPLIERS.find((candidate) => magnitude * candidate >= raw) ?? 10;
  const step = Math.max(minStep, magnitude * multiplier);
  const steps = Math.ceil(m / step);

  return Array.from({ length: steps + 1 }, (_, i) => i * step);
}

/** Y of `value` in the domain `[0, domainMax]`: 0 sits on the frame's bottom edge, `domainMax` on its top. */
export function scaleY(value: number, domainMax: number, frame: PlotFrame): number {
  return frame.top + frame.height - (value / positiveOrOne(domainMax)) * frame.height;
}

/** X of the center of column `index` when the frame is split in `count` equal columns. */
export function columnCenterX(index: number, count: number, frame: PlotFrame): number {
  return frame.left + (index + 0.5) * columnWidth(count, frame);
}

/** Bar of column `index`, from the frame's bottom edge up to `value`; never with a negative height. */
export function barRect(index: number, count: number, value: number, domainMax: number, frame: PlotFrame): Rect {
  const width = columnWidth(count, frame) * BAR_WIDTH_RATIO;
  const y = scaleY(Math.max(0, value), domainMax, frame);

  return {
    x: columnCenterX(index, count, frame) - width / 2,
    y,
    width,
    height: frame.top + frame.height - y,
  };
}

/** Full-height band over the columns of the projected points, or `null` when there are none. */
export function projectionBandRect(points: MonthlyPoint[], frame: PlotFrame): Rect | null {
  const firstProjected = points.findIndex((point) => point.projected);
  if (firstProjected === -1) return null;

  const width = columnWidth(points.length, frame);
  const projectedCount = points.filter((point) => point.projected).length;

  return {
    x: frame.left + firstProjected * width,
    y: frame.top,
    width: projectedCount * width,
    height: frame.height,
  };
}
