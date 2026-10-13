// Client-safe and pure: no values from `@/db` / `@/db/schema` (type imports only).
// Texts of page 1 of the PDF report. Every string is Latin-1 (Helvetica in jsPDF):
// no ellipsis, arrows, "greater or equal" sign, bullets nor typographic quotes; "·", accents and "ñ" are fine.
import type { AdminMetrics, MetricUnit, MonthlyPoint } from "@/modules/admin/admin-metrics.types";
import { formatMetricValue, toKpiSections } from "@/modules/admin/admin-report";
import { isEmptySeries } from "@/modules/admin/admin-series.utils";
import { toLimaDate, toLimaTime } from "@/modules/event/event-list.utils";

export interface ExecutiveFinding {
  title: string;
  text: string;
  attention?: boolean;
}

export interface SummaryCard {
  label: string;
  value: string;
  detail: string;
}

export interface ProjectionTotal {
  label: string;
  value: string;
  detail: string;
}

// Verbatim copy of the charts' `emptyMessage` props in `components/AdminDashboard.tsx`; keep both in sync.
export const EMPTY_SERIES_TEXT = {
  revenue: "Aún no hay órdenes pagadas. El gráfico aparece con los primeros pagos.",
  newUsers: "No hay usuarios nuevos en los últimos 6 meses.",
};

// `exceptZero` also drops the sign when the value rounds to 0, so there is never a "-0".
const percentFormat = new Intl.NumberFormat("es-PE", { maximumFractionDigits: 1, signDisplay: "exceptZero" });

/** Change from `previous` to `current`: `"+12.5 %"`, `"-3 %"`, `"0 %"`; `null` when `previous` is 0. */
export function formatPercentChange(current: number, previous: number): string | null {
  if (previous === 0) return null;
  return `${percentFormat.format(((current - previous) / previous) * 100)} %`;
}

/** Signed difference in soles (`"+S/ 137"`, `"-S/ 137"`); no sign when it rounds to `S/ 0`. */
function formatSignedCents(delta: number): string {
  const amount = formatMetricValue(Math.abs(delta), "cents");
  if (Math.round(Math.abs(delta) / 100) === 0) return amount;
  return `${delta > 0 ? "+" : "-"}${amount}`;
}

function actualPoints(points: MonthlyPoint[]): MonthlyPoint[] {
  return points.filter((point) => !point.projected);
}

function projectedPoints(points: MonthlyPoint[]): MonthlyPoint[] {
  return points.filter((point) => point.projected);
}

/**
 * Last real month (the current Lima month, partial) against the one before.
 * Precondition: a non-empty series has at least 2 real points.
 * Only money (`cents`) adds the difference in soles next to the percentage.
 */
function describeCurrentMonth(
  points: MonthlyPoint[],
  unit: MetricUnit,
  wording: { subject: string; absence: string },
): string {
  const actual = actualPoints(points);
  const current = actual[actual.length - 1];
  const previous = actual[actual.length - 2];
  const head = `${wording.subject} de ${current.label} (mes en curso, parcial): ${formatMetricValue(current.value, unit)}`;
  const percent = formatPercentChange(current.value, previous.value);

  if (percent !== null) {
    const delta = unit === "cents" ? ` (${formatSignedCents(current.value - previous.value)})` : "";
    return `${head}, ${percent}${delta} frente a ${previous.label}.`;
  }
  if (current.value > 0) {
    return `${head}. En ${previous.label} no hubo ${wording.absence}, así que no se calcula la variación.`;
  }
  return `${head}. En ${previous.label} tampoco hubo ${wording.absence}.`;
}

function revenueFinding(revenue: MonthlyPoint[]): ExecutiveFinding {
  const text = isEmptySeries(revenue)
    ? "Aún no hay ventas registradas: no hay órdenes pagadas en los últimos 6 meses."
    : describeCurrentMonth(revenue, "cents", { subject: "Ingresos", absence: "ingresos" });
  return { title: "Ingresos del mes", text };
}

function revenueProjectionFinding(revenue: MonthlyPoint[]): ExecutiveFinding {
  const last = projectedPoints(revenue).at(-1);
  const text = last
    ? `Si se mantiene la tendencia, ${last.label} cerraría con ${formatMetricValue(last.value, "cents")} de ingresos.`
    : "Sin proyección: se necesitan al menos 2 meses con ingresos en los últimos 6.";
  return { title: "Proyección de ingresos", text };
}

function newUsersFinding(newUsers: MonthlyPoint[]): ExecutiveFinding {
  const title = "Usuarios nuevos";
  if (isEmptySeries(newUsers)) return { title, text: EMPTY_SERIES_TEXT.newUsers };

  const last = projectedPoints(newUsers).at(-1);
  const suffix = last
    ? ` Proyección para ${last.label}: ${formatMetricValue(last.value, "count")}.`
    : " Sin proyección: se necesitan al menos 2 meses con registros.";
  return { title, text: describeCurrentMonth(newUsers, "count", { subject: "Usuarios nuevos", absence: "registros" }) + suffix };
}

function catalogFinding({ published, draft, finished, cancelled }: AdminMetrics["eventsByStatus"]): ExecutiveFinding {
  const count = (value: number) => formatMetricValue(value, "count");
  return {
    title: "Catálogo de eventos",
    text: `Publicados: ${count(published)} · Borradores: ${count(draft)} · Finalizados: ${count(finished)} · Cancelados: ${count(cancelled)}.`,
  };
}

function pendingOrganizersFinding(pending: number): ExecutiveFinding {
  const title = "Organizadores pendientes";
  if (pending === 0) return { title, text: "No hay solicitudes de organizador por revisar." };
  return { title, text: `Solicitudes de organizador por revisar: ${formatMetricValue(pending, "count")}.`, attention: true };
}

/** The 5 findings of the executive summary, always in this order. Reads projections from the `projected` points. */
export function buildExecutiveSummary(metrics: AdminMetrics): ExecutiveFinding[] {
  return [
    revenueFinding(metrics.revenueByMonth),
    revenueProjectionFinding(metrics.revenueByMonth),
    newUsersFinding(metrics.newUsersByMonth),
    catalogFinding(metrics.eventsByStatus),
    pendingOrganizersFinding(metrics.pendingOrganizers),
  ];
}

/** Header label and metadata line, with the date and time in Lima. The months span the real revenue points. */
export function buildReportMeta(metrics: AdminMetrics, now: Date): { headerLabel: string; metaLine: string } {
  const date = toLimaDate(now);
  const generated = `Generado el ${date}, ${toLimaTime(now)} (hora de Lima)`;
  const actual = actualPoints(metrics.revenueByMonth);
  const metaLine =
    actual.length > 0
      ? `${generated} · Tendencias de ${actual[0].label} a ${actual[actual.length - 1].label}`
      : generated;

  return { headerLabel: `Reporte de métricas · ${date}`, metaLine };
}

/** Sales cards in display order; each `detail` describes only its own source. */
const SALES_CARDS = [
  { key: "revenueCents", detail: "Valor de las entradas vendidas en eventos publicados y finalizados." },
  { key: "ticketsSold", detail: "Zonas generales y asientos numerados de eventos publicados y finalizados." },
  { key: "platformFeeCents", detail: "Suma de la comisión guardada en las órdenes pagadas." },
];

/** The 3 sales cards of page 1, with labels and values from the `sales` section of `toKpiSections`. */
export function buildSummaryCards(metrics: AdminMetrics): SummaryCard[] {
  // `toKpiSections` always has a `sales` section with exactly these 3 keys, so the lookups cannot miss.
  const sales = toKpiSections(metrics).find((section) => section.id === "sales")!.items;

  return SALES_CARDS.map(({ key, detail }) => {
    const item = sales.find((candidate) => candidate.key === key)!;
    return { label: item.label, value: formatMetricValue(item.value, item.unit), detail };
  });
}

function projectionTotal(points: MonthlyPoint[], unit: MetricUnit, label: string, missingDetail: string): ProjectionTotal {
  const projected = projectedPoints(points);
  if (projected.length === 0) return { label, value: "Sin proyección", detail: missingDetail };

  const total = projected.reduce((sum, point) => sum + point.value, 0);
  return {
    label,
    value: formatMetricValue(total, unit),
    detail: `Suma de ${projected[0].label} a ${projected[projected.length - 1].label}`,
  };
}

/** Projected total of the next quarter per series, each one on its own: `[revenue, new users]`. */
export function buildProjectionTotals(metrics: AdminMetrics): ProjectionTotal[] {
  return [
    projectionTotal(
      metrics.revenueByMonth,
      "cents",
      "Ingresos proyectados",
      "Se necesitan al menos 2 meses con ingresos",
    ),
    projectionTotal(
      metrics.newUsersByMonth,
      "count",
      "Usuarios nuevos proyectados",
      "Se necesitan al menos 2 meses con registros",
    ),
  ];
}
