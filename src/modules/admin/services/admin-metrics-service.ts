import type { AdminMetrics } from "@/modules/admin/admin-metrics.types";
import { toAdminMetrics } from "@/modules/admin/admin-metrics.utils";
import { recentMonths, SERIES_MONTHS } from "@/modules/admin/admin-series.utils";
import {
  countActiveUsersByRole,
  countEventsByStatus,
  countNewUsersByMonth,
  countPendingOrganizers,
  getPaidPlatformFeeCents,
  sumPaidRevenueByMonth,
} from "@/modules/admin/services/admin-metrics-data-service";
import { getSalesSummary } from "@/modules/event/services/event-list-service";
import { can } from "@/modules/user/user.permissions";
import type { Role } from "@/modules/user/user.types";

/**
 * Every global metric of the admin dashboard, read on each call. Fails closed:
 * a role without `report:view-global` throws before any query. `now` picks the
 * window of months (Lima) and is injectable for deterministic tests.
 */
export async function getAdminMetrics(actor: { id: string; role: Role }, now = new Date()): Promise<AdminMetrics> {
  if (!can(actor.role, "report:view-global")) throw new Error("Forbidden");

  const months = recentMonths(now, SERIES_MONTHS);
  const [summary, platformFeeCents, eventRows, roleRows, pendingOrganizers, revenueRows, newUserRows] = await Promise.all([
    getSalesSummary(actor),
    getPaidPlatformFeeCents(),
    countEventsByStatus(),
    countActiveUsersByRole(),
    countPendingOrganizers(),
    sumPaidRevenueByMonth(),
    countNewUsersByMonth(),
  ]);

  return toAdminMetrics({ summary, platformFeeCents, eventRows, roleRows, pendingOrganizers, months, revenueRows, newUserRows });
}
