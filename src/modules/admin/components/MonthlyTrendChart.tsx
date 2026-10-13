"use client";

import { useId, useMemo, useSyncExternalStore } from "react";
import { defineChart, type ChartTooltipContent } from "@tanstack/charts";
import { barY } from "@tanstack/charts/bar";
import { lineY } from "@tanstack/charts/line";
import { decorative } from "@tanstack/charts/mark/decorative";
import { Chart } from "@tanstack/charts/react";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { text } from "@tanstack/charts/text";
import { tooltip } from "@tanstack/charts/tooltip";

import type { ChartDatum, MetricUnit, MonthlyPoint } from "@/modules/admin/admin-metrics.types";
import { formatMetricValue } from "@/modules/admin/admin-report";
import { isEmptySeries, splitForChart } from "@/modules/admin/admin-series.utils";

type ChartVariant = "line" | "bar";

export interface MonthlyTrendChartProps {
  title: string;
  points: MonthlyPoint[];
  unit: MetricUnit;
  variant: ChartVariant;
  emptyMessage: string;
  note?: string;
}

/** Indigo `--primary`; the library paints CSS variables the same way as its own `--ts-chart-*` palette. */
const SERIES_COLOR = "var(--primary, #4F46E5)";
const CHART_HEIGHT = 260;
/** Close to half of a desktop dashboard, so the first measured layout barely moves. */
const CHART_INITIAL_WIDTH = 560;

const subscribeNever = () => () => {};

const pointType = (point: MonthlyPoint) => (point.projected ? "Proyección" : "Real");

/**
 * The definition of the chart: one Y axis from 0, the projection dashed (line)
 * or light with an outline (bars), and a direct "Proyección" label.
 */
function buildDefinition(points: MonthlyPoint[], unit: MetricUnit, variant: ChartVariant) {
  const { actual, projected } = splitForChart(points, { bridge: variant === "line" });
  // The bridge shares its label with the last real month, so it reads as "Real".
  const byLabel = new Map(points.map((point) => [point.label, point]));
  const labels = points.map((point) => point.label);
  const maxValue = Math.max(...points.map((point) => point.value));

  const y = {
    scale: scaleLinear().domain([0, maxValue || 1]),
    nice: true,
    // Default grid: solid hairline in `currentColor`; the dash is reserved for the projection.
    grid: true,
    axis: { ticks: { format: (value: number) => formatMetricValue(value, unit, { compact: true }) } },
  };

  const content = (focused: readonly { datum: ChartDatum }[]): ChartTooltipContent => {
    const point = focused[0] && byLabel.get(focused[0].datum.label);
    if (!point) return { rows: [] };
    return {
      title: point.label,
      rows: [{ label: pointType(point), value: formatMetricValue(point.value, unit), color: SERIES_COLOR }],
    };
  };

  // Empty when there is no projection, so the label only exists with one.
  const projectionLabel = decorative(
    text(projected.slice(-1), {
      id: "projection-label",
      x: "label",
      y: "value",
      text: () => "Proyección",
      dy: -14,
      anchor: variant === "line" ? "end" : "middle",
      fill: SERIES_COLOR,
      fontSize: 11,
      fontWeight: 600,
    }),
  );

  const options = {
    theme: { palette: [SERIES_COLOR] },
    focus: "group-x" as const,
    tooltip: { use: tooltip, content },
  };

  if (variant === "line") {
    return defineChart({
      marks: [
        lineY(actual, { id: "actual", x: "label", y: "value", stroke: SERIES_COLOR, points: true }),
        lineY(projected, {
          id: "projected",
          x: "label",
          y: "value",
          stroke: SERIES_COLOR,
          strokeDasharray: "6 4",
          points: true,
        }),
        projectionLabel,
      ],
      scales: { x: { scale: scalePoint<string>().domain(labels).padding(0.5) }, y },
      ...options,
    });
  }

  return defineChart({
    marks: [
      barY(actual, { id: "actual", x: "label", y: "value", fill: SERIES_COLOR }),
      barY(projected, {
        id: "projected",
        x: "label",
        y: "value",
        fill: SERIES_COLOR,
        fillOpacity: 0.15,
        stroke: SERIES_COLOR,
        strokeWidth: 1.5,
      }),
      projectionLabel,
    ],
    scales: { x: { scale: scaleBand<string>().domain(labels).padding(0.3) }, y },
    ...options,
  });
}

function describeChart(title: string, points: MonthlyPoint[], variant: ChartVariant) {
  const actual = points.filter((point) => !point.projected);
  const projected = points.filter((point) => point.projected);
  const kind = variant === "line" ? "Gráfico de línea" : "Gráfico de columnas";
  const range = `${kind}: ${title}, de ${actual[0].label} a ${actual[actual.length - 1].label}`;
  return projected.length > 0 ? `${range}, con proyección hasta ${projected[projected.length - 1].label}` : range;
}

function TrendChart({ title, points, unit, variant }: Pick<MonthlyTrendChartProps, "title" | "points" | "unit" | "variant">) {
  // The definition's identity is the host's update boundary.
  const definition = useMemo(() => buildDefinition(points, unit, variant), [points, unit, variant]);

  return (
    <Chart
      definition={definition}
      height={CHART_HEIGHT}
      initialWidth={CHART_INITIAL_WIDTH}
      ariaLabel={describeChart(title, points, variant)}
    />
  );
}

/**
 * A monthly series with its projection, or only `emptyMessage` when every real
 * month is 0. The SVG mounts after hydration (tick labels use `Intl`, which can
 * differ between Node and the browser); the `sr-only` table is server-rendered.
 */
export function MonthlyTrendChart({ title, points, unit, variant, emptyMessage, note }: MonthlyTrendChartProps) {
  const headingId = useId();
  // `false` on the server and while hydrating, `true` afterwards: both renders share the empty wrapper.
  const isClient = useSyncExternalStore(subscribeNever, () => true, () => false);

  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-3 rounded-[20px] border border-border bg-card p-[18px] lg:rounded-[22px] lg:p-6"
    >
      <h3 id={headingId} className="text-base font-semibold">
        {title}
      </h3>

      {isEmptySeries(points) ? (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <>
          <div style={{ height: CHART_HEIGHT }}>
            {isClient && <TrendChart title={title} points={points} unit={unit} variant={variant} />}
          </div>
          {note && <p className="text-xs text-muted-foreground">{note}</p>}
          <table className="sr-only">
            <caption>{title}</caption>
            <thead>
              <tr>
                <th scope="col">Mes</th>
                <th scope="col">Valor</th>
                <th scope="col">Tipo</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.month}>
                  <th scope="row">{point.label}</th>
                  {/* `Intl` output (e.g. the space after `S/`) may differ between Node and the browser. */}
                  <td suppressHydrationWarning>{formatMetricValue(point.value, unit)}</td>
                  <td>{pointType(point)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
