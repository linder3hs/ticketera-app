// Client-safe: no values from `@/db` / `@/db/schema` (type imports only).
import type { ChartDatum, MonthKey, MonthlyPoint } from "@/modules/admin/admin-metrics.types";
import { toLimaDate } from "@/modules/event/event-list.utils";

/** Real months shown per series, ending in the current Lima month. */
export const SERIES_MONTHS = 6;
/** Months projected after the last real one. */
export const PROJECTION_MONTHS = 3;

/** `month` moved `delta` months (negative goes back), crossing years as needed. */
function shiftMonth(month: MonthKey, delta: number): MonthKey {
  const [year, monthNumber] = month.split("-").map(Number);
  const index = year * 12 + (monthNumber - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** The `count` months ending in the Lima month of `now`, oldest first. */
export function recentMonths(now: Date, count: number): MonthKey[] {
  const current = toLimaDate(now).slice(0, 7);
  return Array.from({ length: count }, (_, i) => shiftMonth(current, i - count + 1));
}

/** The `count` months right after `month`. */
export function followingMonths(month: MonthKey, count: number): MonthKey[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(month, i + 1));
}

const monthLabelFormat = new Intl.DateTimeFormat("es-PE", { month: "short", year: "numeric", timeZone: "UTC" });

/**
 * `"2026-10"` → `"oct 2026"`. Same criterion as `formatPart` in `event.utils.ts`:
 * the day is parsed as UTC midnight and formatted in UTC, without ICU's dot and lowercased.
 */
export function formatMonthLabel(month: MonthKey): string {
  return monthLabelFormat.format(new Date(`${month}-01`)).replace(".", "").toLowerCase();
}

/**
 * Least-squares linear trend of `values` (x = 0..n-1) evaluated at the next
 * `horizon` x's, each rounded and never below 0. Zeros count as observations.
 * Returns `[]` with fewer than 2 values > 0: a single data point is no trend.
 * ponytail: no seasonality; switch to Holt-Winters once there are more than 12 months of history.
 */
export function projectLinear(values: number[], horizon: number): number[] {
  if (values.filter((value) => value > 0).length < 2) return [];

  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;
  let sxy = 0;
  let sxx = 0;
  values.forEach((value, x) => {
    sxy += (x - meanX) * (value - meanY);
    sxx += (x - meanX) ** 2;
  });
  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;

  return Array.from({ length: horizon }, (_, i) => Math.max(0, Math.round(intercept + slope * (n + i))));
}

function toPoint(month: MonthKey, value: number, projected: boolean): MonthlyPoint {
  return { month, label: formatMonthLabel(month), value, projected };
}

/** Real points of `months` followed by their projection (if any) over the next `horizon` months. */
export function toMonthlySeries(months: MonthKey[], values: number[], horizon = PROJECTION_MONTHS): MonthlyPoint[] {
  const actual = months.map((month, i) => toPoint(month, values[i], false));
  const projection = projectLinear(values, horizon);
  if (projection.length === 0) return actual;

  const nextMonths = followingMonths(months[months.length - 1], horizon);
  return [...actual, ...projection.map((value, i) => toPoint(nextMonths[i], value, true))];
}

/** Whether every real point is 0 (nothing to chart). */
export function isEmptySeries(points: MonthlyPoint[]): boolean {
  return points.every((point) => point.projected || point.value === 0);
}

function toDatum({ month, label, value }: MonthlyPoint, id: string = month): ChartDatum {
  return { id, label, value };
}

/**
 * Splits a series into its real and projected marks. With `bridge` (lines) and
 * a projection, `projected` starts with a copy of the last real point
 * (id `"<month>-bridge"`) so the dashed segment starts where the solid one ends.
 */
export function splitForChart(
  points: MonthlyPoint[],
  options: { bridge: boolean },
): { actual: ChartDatum[]; projected: ChartDatum[] } {
  const actualPoints = points.filter((point) => !point.projected);
  const projected = points.filter((point) => point.projected).map((point) => toDatum(point));
  const lastActual = actualPoints[actualPoints.length - 1];

  if (options.bridge && projected.length > 0 && lastActual) {
    projected.unshift(toDatum(lastActual, `${lastActual.month}-bridge`));
  }

  return { actual: actualPoints.map((point) => toDatum(point)), projected };
}
