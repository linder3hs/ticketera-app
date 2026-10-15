// Server only: imports values from `@/db/schema`; only `admin-metrics-service.ts` uses it.
import { eventStatus } from "@/db/schema";
import type { AdminMetrics, AggregateRow, MonthKey, MonthlyPoint } from "@/modules/admin/admin-metrics.types";
import { toMonthlySeries } from "@/modules/admin/admin-series.utils";
import type { EventStatus, SalesSummary } from "@/modules/event/event-list.types";
import { ROLES } from "@/modules/user/user.permissions";
import type { Role } from "@/modules/user/user.types";

/**
 * One entry per key, in the order of `keys`: the row's value, or 0 when there
 * is no row. Rows whose key is not in `keys` are ignored.
 */
export function fillByKey<K extends string>(keys: readonly K[], rows: readonly AggregateRow<string>[]): Record<K, number> {
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  const filled = {} as Record<K, number>;
  for (const key of keys) filled[key] = byKey.get(key) ?? 0;
  return filled;
}

/** Raw results of the dashboard queries, plus the window of months to chart. */
export interface AdminMetricsSources {
  summary: SalesSummary;
  platformFeeCents: number;
  eventRows: readonly AggregateRow<EventStatus>[];
  roleRows: readonly AggregateRow<Role>[];
  pendingOrganizers: number;
  months: MonthKey[];
  revenueRows: readonly AggregateRow<MonthKey>[];
  newUserRows: readonly AggregateRow<MonthKey>[];
}

function toSeries(months: MonthKey[], rows: readonly AggregateRow<MonthKey>[]): MonthlyPoint[] {
  const filled = fillByKey(months, rows);
  return toMonthlySeries(months, months.map((month) => filled[month]));
}

/** Zero-fills statuses, roles and months and builds both monthly series. `summary.published` is not exposed. */
export function toAdminMetrics(sources: AdminMetricsSources): AdminMetrics {
  return {
    ticketsSold: sources.summary.sold,
    revenueCents: sources.summary.revenueCents,
    platformFeeCents: sources.platformFeeCents,
    eventsByStatus: fillByKey(eventStatus.enumValues, sources.eventRows),
    usersByRole: fillByKey(ROLES, sources.roleRows),
    pendingOrganizers: sources.pendingOrganizers,
    revenueByMonth: toSeries(sources.months, sources.revenueRows),
    newUsersByMonth: toSeries(sources.months, sources.newUserRows),
  };
}
