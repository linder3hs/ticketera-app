import type { EventStatus } from "@/modules/event/event-list.types";
import type { Role } from "@/modules/user/user.types";

/** Calendar month in Lima, formatted `YYYY-MM`. */
export type MonthKey = string;

/** How a metric is stored: money in cents or a plain count. Serializable, so it can cross to client components. */
export type MetricUnit = "cents" | "count";

/** One row of a `group by` aggregate (a count or a sum). */
export interface AggregateRow<K extends string> {
  key: K;
  value: number;
}

/** One month of a chart series; `projected` points come after the real ones. */
export interface MonthlyPoint {
  month: MonthKey;
  /** Pre-formatted on the server (`"oct 2026"`) so SSR and hydration render the same text. */
  label: string;
  value: number;
  projected: boolean;
}

/** Every global metric of the admin dashboard. */
export interface AdminMetrics {
  ticketsSold: number;
  revenueCents: number;
  platformFeeCents: number;
  eventsByStatus: Record<EventStatus, number>;
  usersByRole: Record<Role, number>;
  pendingOrganizers: number;
  revenueByMonth: MonthlyPoint[];
  newUsersByMonth: MonthlyPoint[];
}

export interface KpiItem {
  key: string;
  label: string;
  value: number;
  unit: MetricUnit;
}

export interface KpiSection {
  id: "sales" | "events" | "users" | "moderation";
  title: string;
  items: KpiItem[];
}

/** One mark of a chart. */
export interface ChartDatum {
  id: string;
  label: string;
  value: number;
}

/** One month of the exported table; `null` where that series has no point for the month. */
export interface MonthlyReportRow {
  month: MonthKey;
  label: string;
  revenueCents: number | null;
  newUsers: number | null;
  projected: boolean;
}
