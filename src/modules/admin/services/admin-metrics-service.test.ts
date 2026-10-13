import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MonthlyPoint } from "@/modules/admin/admin-metrics.types";
import {
  countActiveUsersByRole,
  countEventsByStatus,
  countNewUsersByMonth,
  countPendingOrganizers,
  getPaidPlatformFeeCents,
  sumPaidRevenueByMonth,
} from "@/modules/admin/services/admin-metrics-data-service";
import { getAdminMetrics } from "@/modules/admin/services/admin-metrics-service";
import { getSalesSummary } from "@/modules/event/services/event-list-service";
import type { Role } from "@/modules/user/user.types";

// Both modules import `@/db`, which runs `neon(process.env.DATABASE_URL!)` on load.
vi.mock("@/modules/admin/services/admin-metrics-data-service", () => ({
  getPaidPlatformFeeCents: vi.fn(),
  countEventsByStatus: vi.fn(),
  countActiveUsersByRole: vi.fn(),
  countPendingOrganizers: vi.fn(),
  sumPaidRevenueByMonth: vi.fn(),
  countNewUsersByMonth: vi.fn(),
}));
vi.mock("@/modules/event/services/event-list-service", () => ({ getSalesSummary: vi.fn() }));

const dataFunctions = [
  getPaidPlatformFeeCents,
  countEventsByStatus,
  countActiveUsersByRole,
  countPendingOrganizers,
  sumPaidRevenueByMonth,
  countNewUsersByMonth,
];

// 12 Oct 2026 in Lima: the window is May–Oct 2026.
const now = new Date("2026-10-12T12:00:00Z");
const windowMonths = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];

function realPoints(points: MonthlyPoint[]) {
  return points.filter((point) => !point.projected).map(({ month, value }) => ({ month, value }));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getSalesSummary).mockResolvedValue({ sold: 120, revenueCents: 600000, published: 4 });
  vi.mocked(getPaidPlatformFeeCents).mockResolvedValue(1800);
  vi.mocked(countEventsByStatus).mockResolvedValue([{ key: "published", value: 4 }]);
  vi.mocked(countActiveUsersByRole).mockResolvedValue([
    { key: "customer", value: 50 },
    { key: "admin", value: 2 },
  ]);
  vi.mocked(countPendingOrganizers).mockResolvedValue(3);
  // Two months with data (projects) plus one outside the window (ignored).
  vi.mocked(sumPaidRevenueByMonth).mockResolvedValue([
    { key: "2026-10", value: 20000 },
    { key: "2026-01", value: 999 },
    { key: "2026-09", value: 10000 },
  ]);
  // A single month with data: no projection.
  vi.mocked(countNewUsersByMonth).mockResolvedValue([{ key: "2026-07", value: 5 }]);
});

describe("getAdminMetrics", () => {
  it.each<Role>(["organizer", "customer"])("rejects %s before any query", async (role) => {
    await expect(getAdminMetrics({ id: "user-1", role }, now)).rejects.toThrow("Forbidden");

    expect(getSalesSummary).not.toHaveBeenCalled();
    for (const fn of dataFunctions) expect(fn).not.toHaveBeenCalled();
  });

  it.each<Role>(["admin", "super_admin"])("returns the zero-filled metrics for %s", async (role) => {
    const actor = { id: "user-1", role };

    const metrics = await getAdminMetrics(actor, now);

    expect(getSalesSummary).toHaveBeenCalledWith(actor);
    for (const fn of dataFunctions) expect(fn).toHaveBeenCalledOnce();

    expect(metrics.ticketsSold).toBe(120);
    expect(metrics.revenueCents).toBe(600000);
    expect(metrics.platformFeeCents).toBe(1800);
    expect(metrics.pendingOrganizers).toBe(3);
    expect(metrics).not.toHaveProperty("published");
    expect(metrics.eventsByStatus).toEqual({ draft: 0, published: 4, cancelled: 0, finished: 0 });
    expect(metrics.usersByRole).toEqual({ super_admin: 0, admin: 2, organizer: 0, customer: 50 });

    expect(realPoints(metrics.revenueByMonth)).toEqual(
      windowMonths.map((month, i) => ({ month, value: [0, 0, 0, 0, 10000, 20000][i] })),
    );
    const projected = metrics.revenueByMonth.filter((point) => point.projected);
    expect(projected.map((point) => point.month)).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(metrics.revenueByMonth.slice(-3).every((point) => point.projected)).toBe(true);

    expect(metrics.newUsersByMonth).toHaveLength(6);
    expect(realPoints(metrics.newUsersByMonth)).toEqual(
      windowMonths.map((month, i) => ({ month, value: [0, 0, 5, 0, 0, 0][i] })),
    );

    expect(metrics.revenueByMonth[5].label).toBe("oct 2026");
  });
});
