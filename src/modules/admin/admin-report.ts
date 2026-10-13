// Client-safe and pure: no values from `@/db` / `@/db/schema` (type imports only).
// Single source of KPIs and formats for the dashboard, the PDF and the Excel export.
import type {
  AdminMetrics,
  KpiSection,
  MetricUnit,
  MonthKey,
  MonthlyPoint,
  MonthlyReportRow,
} from "@/modules/admin/admin-metrics.types";
import { EVENT_STATUS_LABEL } from "@/modules/event/components/event-status-labels";
import type { EventStatus } from "@/modules/event/event-list.types";
import { toLimaDate } from "@/modules/event/event-list.utils";
import { formatEventPrice } from "@/modules/event/event.utils";
import { ROLE_LABEL } from "@/modules/user/components/role-labels";
import { ROLES } from "@/modules/user/user.permissions";

const countFormat = new Intl.NumberFormat("es-PE");
const compactCountFormat = new Intl.NumberFormat("es-PE", { notation: "compact" });
// `formatEventPrice` fixes its options, so the compact currency (Y-axis ticks) has its own formatter.
const compactCurrencyFormat = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  notation: "compact",
  maximumFractionDigits: 0,
});

/** `count` → `"1,234"`; `cents` → soles (`"S/ 1,235"`). `compact` (chart ticks) abbreviates large values. */
export function formatMetricValue(value: number, unit: MetricUnit, options: { compact?: boolean } = {}): string {
  if (unit === "count") return (options.compact ? compactCountFormat : countFormat).format(value);
  const soles = value / 100;
  return options.compact ? compactCurrencyFormat.format(soles) : formatEventPrice(soles, "PEN");
}

/** The 12 KPIs of the dashboard in 4 sections: labels, order and unit of each one. */
export function toKpiSections(metrics: AdminMetrics): KpiSection[] {
  const statuses = Object.keys(metrics.eventsByStatus) as EventStatus[];

  return [
    {
      id: "sales",
      title: "Ventas",
      items: [
        { key: "ticketsSold", label: "Entradas vendidas", value: metrics.ticketsSold, unit: "count" },
        { key: "revenueCents", label: "Ingresos", value: metrics.revenueCents, unit: "cents" },
        { key: "platformFeeCents", label: "Comisión de la plataforma", value: metrics.platformFeeCents, unit: "cents" },
      ],
    },
    {
      id: "events",
      title: "Eventos por estado",
      items: statuses.map((status) => ({
        key: status,
        label: EVENT_STATUS_LABEL[status],
        value: metrics.eventsByStatus[status],
        unit: "count",
      })),
    },
    {
      id: "users",
      title: "Usuarios por rol",
      items: ROLES.map((role) => ({ key: role, label: ROLE_LABEL[role], value: metrics.usersByRole[role], unit: "count" })),
    },
    {
      id: "moderation",
      title: "Moderación",
      items: [{ key: "pendingOrganizers", label: "Organizadores pendientes", value: metrics.pendingOrganizers, unit: "count" }],
    },
  ];
}

/**
 * Joins both series by month, oldest first. A series without a point for a
 * month leaves `null`; a row is `projected` when any of its points is.
 */
export function buildMonthlyRows(revenue: MonthlyPoint[], users: MonthlyPoint[]): MonthlyReportRow[] {
  const rows = new Map<MonthKey, MonthlyReportRow>();
  const rowFor = ({ month, label, projected }: MonthlyPoint): MonthlyReportRow => {
    const row = rows.get(month) ?? { month, label, revenueCents: null, newUsers: null, projected: false };
    row.projected ||= projected;
    rows.set(month, row);
    return row;
  };

  for (const point of revenue) rowFor(point).revenueCents = point.value;
  for (const point of users) rowFor(point).newUsers = point.value;

  return [...rows.values()].sort((a, b) => a.month.localeCompare(b.month));
}

/** `ticketera-dashboard-YYYY-MM-DD.<ext>`, with today's date in Lima. */
export function exportFileName(ext: "pdf" | "xlsx", now = new Date()): string {
  return `ticketera-dashboard-${toLimaDate(now)}.${ext}`;
}
