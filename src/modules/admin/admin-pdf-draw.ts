// Client-only drawing of the dashboard PDF report: 3 A4 pages (summary, trends, detail).
// The texts of page 1 (`admin-executive-summary.ts`) and the chart geometry
// (`admin-pdf-chart.utils.ts`) are pure; this file only places them on the page.
// `jspdf` is loaded on demand inside `buildDashboardPdf`, so it is not part of the page bundle.
import type { jsPDF } from "jspdf";

import {
  EMPTY_SERIES_TEXT,
  buildExecutiveSummary,
  buildProjectionTotals,
  buildReportMeta,
  buildSummaryCards,
  type ExecutiveFinding,
  type ProjectionTotal,
} from "@/modules/admin/admin-executive-summary";
import type { AdminMetrics, MetricUnit, MonthlyPoint } from "@/modules/admin/admin-metrics.types";
import {
  barRect,
  columnCenterX,
  niceTicks,
  projectionBandRect,
  scaleY,
  type PlotFrame,
  type Rect,
} from "@/modules/admin/admin-pdf-chart.utils";
import { formatMetricValue, toKpiSections } from "@/modules/admin/admin-report";
import { isEmptySeries, splitForChart } from "@/modules/admin/admin-series.utils";

/**
 * jsPDF's built-in fonts only cover Latin-1 (same criterion as `pdfText` in
 * `ticket-export.ts`): dashes and curly quotes become ASCII, the (narrow)
 * no-break spaces that `Intl` puts after `S/` become plain spaces, and
 * anything else outside Latin-1 is dropped.
 */
function pdfText(text: string) {
  return text
    .replace(/[—–]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[  ]/g, " ")
    .replace(/[^ -ÿ]/g, "");
}

/** Millimetres per design pixel of the mockup (794 px = 210 mm). */
const PX = 210 / 794;
/** Millimetres per typographic point. */
const PT = 25.4 / 72;
/** jsPDF's default line height factor, the spacing of a multi-line `doc.text`. */
const LINE_HEIGHT_FACTOR = 1.15;

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 19;
const RIGHT = PAGE_WIDTH - MARGIN;
const CONTENT_WIDTH = RIGHT - MARGIN;

const TOP_BAR_HEIGHT = 6 * PX;
const LOGO = { top: 8, size: 6, radius: 1.2 };
const HEADER_BASELINE = 12.4;
const HEADER_RULE_Y = 17;
const PAGE_TITLE_BASELINE = 31;
const FOOTER_BASELINE = PAGE_HEIGHT - 10;
const CONTENT_BOTTOM = FOOTER_BASELINE - 8;

const COLOR = {
  indigo: "#4F46E5",
  rule: "#d4d4d4",
  band: "#f4f4f5",
  projectedBar: "#e0e7ff",
  projectionBox: "#eef2ff",
  projectionBoxBorder: "#c7d2fe",
  attention: "#fef3c7",
  attentionText: "#78350f",
  text: "#18181b",
  muted: "#52525b",
  grid: "#e4e4e7",
  white: "#ffffff",
};

/** Thinnest stroke (jsPDF's 0.2 mm default is never used) and the stroke of the line series. */
const LINE_WIDTH = 0.3;
const SERIES_WIDTH = 0.6;

interface TextStyle {
  size: number;
  bold?: boolean;
  color?: string;
}

/** Type scale; nothing goes below 9 pt. */
const STYLE = {
  overline: { size: 9, bold: true, color: COLOR.indigo },
  h1: { size: 22, bold: true },
  pageTitle: { size: 14, bold: true },
  heading: { size: 10, bold: true },
  body: { size: 10 },
  bodyMuted: { size: 10, color: COLOR.muted },
  value: { size: 18, bold: true },
  small: { size: 9, color: COLOR.muted },
  smallStrong: { size: 9, bold: true },
  tableCell: { size: 9 },
  tag: { size: 9, bold: true, color: COLOR.attentionText },
} satisfies Record<string, TextStyle>;

const CARD = { gap: 4, padding: 4, radius: 2 };
/** Baselines of a stat (card or projection entry), from its top. */
const STAT = { label: 3, value: 11, detail: 16 };

const FINDING_INDENT = 6;
const TAG = { padding: 1.5, height: 4.8, ascent: 3.4, radius: 1 };
const BOX_TITLE_SPACE = 6;
const BULLET = { indent: 5, radius: 0.7 };

/** Plot area of each figure: a 28 mm label column, then 144 mm of plot. */
const PLOT_LEFT = MARGIN + 28;
const PLOT_WIDTH = RIGHT - PLOT_LEFT;
const PLOT_HEIGHT = 60;
/** From the figure title's baseline to the plot's top edge. */
const PLOT_OFFSET = 12;
/** Room above the plot, inside the band: its label sits there, clear of the series and the direct labels. */
const LABEL_ROOM = 9;
const VALUE_LABEL_OFFSET = 2.5;
const VALUE_LABEL_HALO = { padding: 0.6, ascent: 2.8, height: 3.5 };
const MARKER_RADIUS = 1.2;
const TABLE_ROW_HEIGHT = 6;
const TABLE_BASELINE = 4.2;
const LEGEND = { swatch: 6, gap: 1.5, itemGap: 4, square: 3 };
const FIGURE_GAP = 14;
/** Y-axis step floor: S/ 1 for money, 1 for counts. */
const MIN_TICK_STEP: Record<MetricUnit, number> = { cents: 100, count: 1 };

const FOOTER_TEXT = "Uso interno · Generado desde el panel de administración";
const PROJECTION_FOOTNOTE =
  "* Proyección por tendencia lineal (mínimos cuadrados) sobre los últimos 6 meses reales. Es una estimación; ver Notas y metodología en la página 3.";
const MODERATION_DETAIL = "Solicitudes de organizador que esperan aprobación.";
const METHODOLOGY_NOTES = [
  "Tarjetas de Ingresos y Entradas vendidas: salen del inventario (entradas vendidas en zonas generales y asientos vendidos en zonas numeradas, por el precio de su zona), solo en eventos publicados y finalizados.",
  "Gráfico de ingresos: suma lo cobrado en órdenes pagadas, agrupado por mes de pago en hora de Lima. No coincide con la tarjeta Ingresos porque mide otra cosa (cobros, no inventario vendido) y solo cubre los últimos 6 meses.",
  "Comisión de la plataforma: suma la comisión guardada en cada orden pagada al momento del cobro; no se recalcula con el porcentaje vigente.",
  "Proyección: tendencia lineal por mínimos cuadrados sobre los 6 meses reales (los meses sin datos cuentan como 0), redondeada y nunca menor que 0, para los 3 meses siguientes. No considera estacionalidad y solo se calcula si hay al menos 2 meses con valores mayores que 0.",
  "Montos: se asume una sola moneda, soles (PEN), redondeados al sol y sin decimales. Las fechas y los meses usan la hora de Lima.",
];

type ChartVariant = "line" | "bar";

interface TrendFigure {
  title: string;
  rowLabel: string;
  points: MonthlyPoint[];
  unit: MetricUnit;
  variant: ChartVariant;
  emptyText: string;
}

interface Stat {
  label: string;
  value: string;
  detail?: string;
}

interface Point {
  x: number;
  y: number;
}

// ---- Text and strokes -------------------------------------------------------

function lineHeight(size: number): number {
  return size * LINE_HEIGHT_FACTOR * PT;
}

function setTextStyle(doc: jsPDF, { size, bold = false, color = COLOR.text }: TextStyle) {
  doc.setFont("helvetica", bold ? "bold" : "normal");
  doc.setFontSize(size);
  doc.setTextColor(color);
}

/** The only `doc.text` of the report, so every string goes through `pdfText`. */
function write(
  doc: jsPDF,
  text: string | string[],
  x: number,
  y: number,
  style: TextStyle,
  options?: { align: "center" | "right" },
) {
  setTextStyle(doc, style);
  doc.text(typeof text === "string" ? pdfText(text) : text.map(pdfText), x, y, options);
}

function textWidth(doc: jsPDF, text: string, style: TextStyle): number {
  setTextStyle(doc, style);
  return doc.getTextWidth(pdfText(text));
}

/** `text` split in lines that fit `width`, measured with `style`. */
function wrap(doc: jsPDF, text: string, width: number, style: TextStyle): string[] {
  setTextStyle(doc, style);
  return doc.splitTextToSize(pdfText(text), width);
}

/** Wrapped text from baseline `y`; returns the baseline right after its last line. */
function writeParagraph(doc: jsPDF, text: string, x: number, y: number, width: number, style: TextStyle): number {
  const lines = wrap(doc, text, width, style);
  write(doc, lines, x, y, style);
  return y + lines.length * lineHeight(style.size);
}

/** Every line or border is drawn right after this, so none is thinner than 0.3 mm. */
function setStroke(doc: jsPDF, color: string, width = LINE_WIDTH) {
  doc.setDrawColor(color);
  doc.setLineWidth(width);
}

/** Draws with the projection's dash pattern and goes back to solid lines. */
function withDash(doc: jsPDF, draw: () => void) {
  doc.setLineDashPattern([1.6, 1.1], 0);
  draw();
  doc.setLineDashPattern([], 0);
}

// ---- Shared blocks ------------------------------------------------------------

/** Top bar, header (logo, brand and `headerLabel`) and footer of every page. */
function drawPageChrome(doc: jsPDF, pageNumber: number, pageCount: number, headerLabel: string) {
  doc.setFillColor(COLOR.indigo);
  doc.rect(0, 0, PAGE_WIDTH, TOP_BAR_HEIGHT, "F");
  doc.roundedRect(MARGIN, LOGO.top, LOGO.size, LOGO.size, LOGO.radius, LOGO.radius, "F");
  write(doc, "Ticketera", MARGIN + LOGO.size + 2.5, HEADER_BASELINE, STYLE.heading);
  write(doc, headerLabel, RIGHT, HEADER_BASELINE, STYLE.small, { align: "right" });
  setStroke(doc, COLOR.rule);
  doc.line(MARGIN, HEADER_RULE_Y, RIGHT, HEADER_RULE_Y);

  write(doc, FOOTER_TEXT, MARGIN, FOOTER_BASELINE, STYLE.small);
  write(doc, `Página ${pageNumber} de ${pageCount}`, RIGHT, FOOTER_BASELINE, STYLE.small, { align: "right" });
}

/** Width of each of `count` equal columns across `width`, separated by the card gap. */
function columnWidth(width: number, count: number): number {
  return (width - CARD.gap * (count - 1)) / count;
}

/** Wraps each detail to `wrapWidth` and returns the height of the tallest stat (only the detail wraps). */
function layoutStats(doc: jsPDF, stats: Stat[], wrapWidth: number): { details: string[][]; height: number } {
  const details = stats.map((stat) => (stat.detail ? wrap(doc, stat.detail, wrapWidth, STYLE.small) : []));
  const lines = Math.max(0, ...details.map((detail) => detail.length));
  const height = lines > 0 ? STAT.detail + (lines - 1) * lineHeight(STYLE.small.size) + 1 : STAT.value + 1.5;
  return { details, height };
}

function drawStat(doc: jsPDF, stat: Stat, detail: string[], x: number, top: number) {
  write(doc, stat.label, x, top + STAT.label, STYLE.small);
  write(doc, stat.value, x, top + STAT.value, STYLE.value);
  if (detail.length > 0) write(doc, detail, x, top + STAT.detail, STYLE.small);
}

/** One row of bordered cards across the content width, all as tall as the tallest. Returns the y below it. */
function drawCardRow(doc: jsPDF, cards: Stat[], top: number): number {
  const width = columnWidth(CONTENT_WIDTH, cards.length);
  const { details, height } = layoutStats(doc, cards, width - CARD.padding * 2);
  const cardHeight = height + CARD.padding * 2;

  cards.forEach((card, i) => {
    const x = MARGIN + i * (width + CARD.gap);
    setStroke(doc, COLOR.rule);
    doc.roundedRect(x, top, width, cardHeight, CARD.radius, CARD.radius, "S");
    drawStat(doc, card, details[i], x + CARD.padding, top + CARD.padding);
  });
  return top + cardHeight;
}

// ---- Page 1: executive summary --------------------------------------------------

function drawAttentionTag(doc: jsPDF, x: number, baseline: number) {
  const label = "Requiere atención";
  doc.setFillColor(COLOR.attention);
  doc.roundedRect(x, baseline - TAG.ascent, textWidth(doc, label, STYLE.tag) + TAG.padding * 2, TAG.height, TAG.radius, TAG.radius, "F");
  write(doc, label, x + TAG.padding, baseline, STYLE.tag);
}

/** The numbered findings; returns the baseline below the last one. */
function drawFindings(doc: jsPDF, findings: ExecutiveFinding[], top: number): number {
  const x = MARGIN + FINDING_INDENT;
  let y = top;
  findings.forEach((finding, i) => {
    write(doc, `${i + 1}.`, MARGIN, y, STYLE.heading);
    write(doc, finding.title, x, y, STYLE.heading);
    if (finding.attention) drawAttentionTag(doc, x + textWidth(doc, finding.title, STYLE.heading) + 3, y);
    y = writeParagraph(doc, finding.text, x, y + lineHeight(STYLE.body.size) + 0.5, CONTENT_WIDTH - FINDING_INDENT, STYLE.body) + 2.5;
  });
  return y;
}

function drawProjectionBox(doc: jsPDF, totals: ProjectionTotal[], top: number) {
  const width = columnWidth(CONTENT_WIDTH - CARD.padding * 2, totals.length);
  const { details, height } = layoutStats(doc, totals, width);
  const statsTop = top + CARD.padding + BOX_TITLE_SPACE;

  doc.setFillColor(COLOR.projectionBox);
  setStroke(doc, COLOR.projectionBoxBorder);
  doc.roundedRect(MARGIN, top, CONTENT_WIDTH, BOX_TITLE_SPACE + height + CARD.padding * 2, CARD.radius, CARD.radius, "FD");
  write(doc, "Proyección próximo trimestre", MARGIN + CARD.padding, top + CARD.padding + 3, STYLE.heading);
  totals.forEach((total, i) => drawStat(doc, total, details[i], MARGIN + CARD.padding + i * (width + CARD.gap), statsTop));
}

function drawSummaryPage(doc: jsPDF, metrics: AdminMetrics, metaLine: string) {
  write(doc, "REPORTE DE ADMINISTRACIÓN", MARGIN, 29, STYLE.overline);
  write(doc, "Métricas de la plataforma", MARGIN, 38.5, STYLE.h1);
  let y = writeParagraph(doc, metaLine, MARGIN, 45, CONTENT_WIDTH, STYLE.bodyMuted);

  y = drawCardRow(doc, buildSummaryCards(metrics), y + 1) + 12;
  write(doc, "Resumen ejecutivo", MARGIN, y, STYLE.pageTitle);
  y = drawFindings(doc, buildExecutiveSummary(metrics), y + 8);
  drawProjectionBox(doc, buildProjectionTotals(metrics), y + 2);
}

// ---- Page 2: trends ----------------------------------------------------------------

function hasProjection(points: MonthlyPoint[]): boolean {
  return points.some((point) => point.projected);
}

function drawPolyline(doc: jsPDF, points: Point[]) {
  if (points.length < 2) return;
  const deltas = points.slice(1).map((point, i) => [point.x - points[i].x, point.y - points[i].y]);
  doc.lines(deltas, points[0].x, points[0].y, [1, 1], "S", false);
}

/** A point of the line: filled when real, hollow (white inside) when projected. */
function drawMarker(doc: jsPDF, { x, y }: Point, projected: boolean) {
  if (projected) {
    doc.setFillColor(COLOR.white);
    setStroke(doc, COLOR.indigo);
    doc.circle(x, y, MARKER_RADIUS, "FD");
  } else {
    doc.setFillColor(COLOR.indigo);
    doc.circle(x, y, MARKER_RADIUS, "F");
  }
}

/** A bar (or its legend swatch): solid indigo when real, light with a dashed indigo border when projected. */
function drawBar(doc: jsPDF, { x, y, width, height }: Rect, projected: boolean) {
  if (projected) {
    doc.setFillColor(COLOR.projectedBar);
    setStroke(doc, COLOR.indigo);
    withDash(doc, () => doc.rect(x, y, width, height, "FD"));
  } else {
    doc.setFillColor(COLOR.indigo);
    doc.rect(x, y, width, height, "F");
  }
}

/** A line segment with its marker in the middle: the legend sample of the line series. */
function drawLineSample(doc: jsPDF, x: number, y: number, projected: boolean) {
  const draw = () => doc.line(x, y, x + LEGEND.swatch, y);
  setStroke(doc, COLOR.indigo, SERIES_WIDTH);
  if (projected) withDash(doc, draw);
  else draw();
  drawMarker(doc, { x: x + LEGEND.swatch / 2, y }, projected);
}

/** "Real" and, with a projection, "Proyección", right-aligned on the figure title's baseline. */
function drawLegend(doc: jsPDF, variant: ChartVariant, withProjection: boolean, baseline: number) {
  const center = baseline - 1.1;
  let x = RIGHT;
  for (const projected of withProjection ? [true, false] : [false]) {
    const label = projected ? "Proyección" : "Real";
    write(doc, label, x, baseline, STYLE.small, { align: "right" });
    x -= textWidth(doc, label, STYLE.small) + LEGEND.gap + LEGEND.swatch;
    if (variant === "line") drawLineSample(doc, x, center, projected);
    else {
      const offset = (LEGEND.swatch - LEGEND.square) / 2;
      drawBar(doc, { x: x + offset, y: center - LEGEND.square / 2, width: LEGEND.square, height: LEGEND.square }, projected);
    }
    x -= LEGEND.itemGap;
  }
}

/** The projection band (behind everything) with its "Proyección" label at the top. */
function drawProjectionBand(doc: jsPDF, points: MonthlyPoint[], frame: PlotFrame) {
  const band = projectionBandRect(points, { ...frame, top: frame.top - LABEL_ROOM, height: frame.height + LABEL_ROOM });
  if (!band) return;
  doc.setFillColor(COLOR.band);
  doc.rect(band.x, band.y, band.width, band.height, "F");
  write(doc, "Proyección", band.x + band.width / 2, band.y + 3.5, STYLE.small, { align: "center" });
}

/** Solid grid line and compact label at each tick. */
function drawGrid(doc: jsPDF, ticks: number[], unit: MetricUnit, frame: PlotFrame) {
  const domainMax = ticks[ticks.length - 1];
  for (const tick of ticks) {
    const y = scaleY(tick, domainMax, frame);
    setStroke(doc, COLOR.grid);
    doc.line(frame.left, y, frame.left + frame.width, y);
    write(doc, formatMetricValue(tick, unit, { compact: true }), frame.left - 2, y + 1.1, STYLE.small, { align: "right" });
  }
}

/** Solid real segment with filled points; dashed projection from the last real one with hollow points. */
function drawLineSeries(doc: jsPDF, points: MonthlyPoint[], domainMax: number, frame: PlotFrame) {
  const { actual, projected } = splitForChart(points, { bridge: true });
  const at = (value: number, column: number): Point => ({
    x: columnCenterX(column, points.length, frame),
    y: scaleY(value, domainMax, frame),
  });
  const actualPoints = actual.map((datum, i) => at(datum.value, i));
  // `projected[0]` is the bridge (a copy of the last real point), so it shares that column.
  const projectedPoints = projected.map((datum, j) => at(datum.value, actual.length - 1 + j));

  setStroke(doc, COLOR.indigo, SERIES_WIDTH);
  drawPolyline(doc, actualPoints);
  if (projectedPoints.length > 0) withDash(doc, () => drawPolyline(doc, projectedPoints));

  actualPoints.forEach((point) => drawMarker(doc, point, false));
  // The bridge has no marker of its own: the last real month keeps its filled point.
  projected.forEach((datum, j) => {
    if (!datum.id.endsWith("-bridge")) drawMarker(doc, projectedPoints[j], true);
  });
}

function drawBarSeries(doc: jsPDF, points: MonthlyPoint[], domainMax: number, frame: PlotFrame) {
  points.forEach((point, i) => {
    const bar = barRect(i, points.length, point.value, domainMax, frame);
    if (bar.height > 0) drawBar(doc, bar, point.projected);
  });
}

/** Full value over the last real month and, with a projection, over the last projected one. */
function drawDirectLabels(doc: jsPDF, points: MonthlyPoint[], unit: MetricUnit, domainMax: number, frame: PlotFrame) {
  // Projected points come after the real ones.
  const lastActual = points.filter((point) => !point.projected).length - 1;
  const indexes = hasProjection(points) ? [lastActual, points.length - 1] : [lastActual];

  for (const index of indexes) {
    const { value, projected } = points[index];
    const text = formatMetricValue(value, unit);
    const width = textWidth(doc, text, STYLE.smallStrong);
    const centered = columnCenterX(index, points.length, frame) - width / 2;
    const x = Math.min(Math.max(centered, frame.left), frame.left + frame.width - width);
    const baseline = scaleY(value, domainMax, frame) - VALUE_LABEL_OFFSET;
    // Background of the label's own column, so a segment passing under the text does not cross it.
    doc.setFillColor(projected ? COLOR.band : COLOR.white);
    doc.rect(x - VALUE_LABEL_HALO.padding, baseline - VALUE_LABEL_HALO.ascent, width + VALUE_LABEL_HALO.padding * 2, VALUE_LABEL_HALO.height, "F");
    write(doc, text, x, baseline, STYLE.smallStrong);
  }
}

function drawPlot(doc: jsPDF, { points, unit, variant }: TrendFigure, frame: PlotFrame) {
  // Same domain as the dashboard chart: every point, real and projected.
  const ticks = niceTicks(Math.max(...points.map((point) => point.value)), { minStep: MIN_TICK_STEP[unit] });
  const domainMax = ticks[ticks.length - 1];

  drawProjectionBand(doc, points, frame);
  drawGrid(doc, ticks, unit, frame);
  if (variant === "line") drawLineSeries(doc, points, domainMax, frame);
  else drawBarSeries(doc, points, domainMax, frame);
  drawDirectLabels(doc, points, unit, domainMax, frame);
}

/** Value of a table cell; compact when the full amount does not fit its column. */
function tableValue(doc: jsPDF, value: number, unit: MetricUnit, cellWidth: number): string {
  const full = formatMetricValue(value, unit);
  return textWidth(doc, full, STYLE.tableCell) > cellWidth - 1 ? formatMetricValue(value, unit, { compact: true }) : full;
}

/** The figure's X axis: one column per month, centered on the plot's columns. Returns the y below it. */
function drawTable(doc: jsPDF, { points, unit, rowLabel }: TrendFigure, frame: PlotFrame): number {
  const top = frame.top + frame.height;
  const height = TABLE_ROW_HEIGHT * 2;
  // Same columns as the plot band, over both rows.
  const shade = projectionBandRect(points, { ...frame, top, height });
  if (shade) {
    doc.setFillColor(COLOR.band);
    doc.rect(shade.x, shade.y, shade.width, shade.height, "F");
  }

  const cellWidth = frame.width / points.length;
  const rows = [
    { label: "Mes", cells: points.map((point) => (point.projected ? `${point.label}*` : point.label)), style: STYLE.smallStrong },
    { label: rowLabel, cells: points.map((point) => tableValue(doc, point.value, unit, cellWidth)), style: STYLE.tableCell },
  ];
  rows.forEach((row, r) => {
    const baseline = top + r * TABLE_ROW_HEIGHT + TABLE_BASELINE;
    write(doc, row.label, MARGIN, baseline, STYLE.smallStrong);
    row.cells.forEach((cell, i) => {
      write(doc, cell, columnCenterX(i, points.length, frame), baseline, row.style, { align: "center" });
    });
  });
  return top + height;
}

/** Title, legend, plot (or the empty message) and table of one series. Returns the y below it. */
function drawFigure(doc: jsPDF, figure: TrendFigure, top: number): number {
  const frame: PlotFrame = { left: PLOT_LEFT, top: top + PLOT_OFFSET, width: PLOT_WIDTH, height: PLOT_HEIGHT };
  write(doc, figure.title, MARGIN, top, STYLE.heading);

  if (isEmptySeries(figure.points)) {
    // One line, no wrapping: at 10 pt the longest message (~114 mm) fits the 144 mm plot.
    const center = { x: frame.left + frame.width / 2, y: frame.top + frame.height / 2 };
    write(doc, figure.emptyText, center.x, center.y, STYLE.bodyMuted, { align: "center" });
  } else {
    drawLegend(doc, figure.variant, hasProjection(figure.points), top);
    drawPlot(doc, figure, frame);
  }
  return drawTable(doc, figure, frame);
}

function drawTrendsPage(doc: jsPDF, metrics: AdminMetrics) {
  const figures: TrendFigure[] = [
    {
      title: "Ingresos por mes",
      rowLabel: "Ingresos",
      points: metrics.revenueByMonth,
      unit: "cents",
      variant: "line",
      emptyText: EMPTY_SERIES_TEXT.revenue,
    },
    {
      title: "Usuarios nuevos por mes",
      rowLabel: "Usuarios nuevos",
      points: metrics.newUsersByMonth,
      unit: "count",
      variant: "bar",
      emptyText: EMPTY_SERIES_TEXT.newUsers,
    },
  ];

  write(doc, "Tendencias", MARGIN, PAGE_TITLE_BASELINE, STYLE.pageTitle);
  let y = PAGE_TITLE_BASELINE + 10;
  for (const figure of figures) y = drawFigure(doc, figure, y) + FIGURE_GAP;

  if (figures.some((figure) => hasProjection(figure.points))) {
    // At the bottom of the page: its last line sits on the content's bottom edge.
    const lines = wrap(doc, PROJECTION_FOOTNOTE, CONTENT_WIDTH, STYLE.small);
    write(doc, lines, MARGIN, CONTENT_BOTTOM - (lines.length - 1) * lineHeight(STYLE.small.size), STYLE.small);
  }
}

// ---- Page 3: detail ------------------------------------------------------------------

function drawDetailPage(doc: jsPDF, metrics: AdminMetrics) {
  write(doc, "Detalle", MARGIN, PAGE_TITLE_BASELINE, STYLE.pageTitle);
  let y = PAGE_TITLE_BASELINE + 10;

  for (const section of toKpiSections(metrics)) {
    if (section.id === "sales") continue;
    const cards = section.items.map((item) => ({
      label: item.label,
      value: formatMetricValue(item.value, item.unit),
      detail: section.id === "moderation" ? MODERATION_DETAIL : undefined,
    }));
    write(doc, section.title, MARGIN, y, STYLE.heading);
    y = drawCardRow(doc, cards, y + 3) + 9;
  }

  y += 4;
  write(doc, "Notas y metodología", MARGIN, y, STYLE.pageTitle);
  y += 8;
  for (const note of METHODOLOGY_NOTES) {
    doc.setFillColor(COLOR.text);
    doc.circle(MARGIN + BULLET.radius + 0.5, y - 1.2, BULLET.radius, "F");
    y = writeParagraph(doc, note, MARGIN + BULLET.indent, y, CONTENT_WIDTH - BULLET.indent, STYLE.body) + 1.5;
  }
}

/**
 * The dashboard report: A4 portrait, always 3 pages (executive summary, trends
 * and detail). Returns the document without saving it; `now` dates the header.
 */
export async function buildDashboardPdf(metrics: AdminMetrics, now: Date): Promise<jsPDF> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const { headerLabel, metaLine } = buildReportMeta(metrics, now);
  const pages = [
    () => drawSummaryPage(doc, metrics, metaLine),
    () => drawTrendsPage(doc, metrics),
    () => drawDetailPage(doc, metrics),
  ];

  pages.forEach((drawPage, i) => {
    if (i > 0) doc.addPage();
    drawPageChrome(doc, i + 1, pages.length, headerLabel);
    drawPage();
  });
  return doc;
}
