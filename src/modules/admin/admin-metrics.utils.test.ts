import { describe, expect, it } from "vitest";

import { fillByKey, toAdminMetrics } from "@/modules/admin/admin-metrics.utils";

const STATUSES = ["draft", "published", "cancelled", "finished"] as const;
const ROLE_KEYS = ["super_admin", "admin", "organizer", "customer"] as const;
const MONTHS = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];

describe("fillByKey", () => {
  it("fills missing statuses with 0", () => {
    expect(fillByKey(STATUSES, [{ key: "published", value: 3 }])).toEqual({
      draft: 0,
      published: 3,
      cancelled: 0,
      finished: 0,
    });
  });

  it("fills missing roles with 0", () => {
    expect(fillByKey(ROLE_KEYS, [{ key: "customer", value: 12 }])).toEqual({
      super_admin: 0,
      admin: 0,
      organizer: 0,
      customer: 12,
    });
  });

  it("fills a month without a row with 0 and ignores a month outside the window", () => {
    const filled = fillByKey(MONTHS, [
      { key: "2026-09", value: 500 },
      { key: "2026-04", value: 999 },
    ]);

    expect(filled).toEqual({
      "2026-05": 0,
      "2026-06": 0,
      "2026-07": 0,
      "2026-08": 0,
      "2026-09": 500,
      "2026-10": 0,
    });
  });

  it("sets every key to 0 without rows", () => {
    expect(fillByKey(STATUSES, [])).toEqual({ draft: 0, published: 0, cancelled: 0, finished: 0 });
  });

  it("keeps the order of keys, not of rows", () => {
    const filled = fillByKey(STATUSES, [
      { key: "finished", value: 1 },
      { key: "draft", value: 2 },
    ]);

    expect(Object.keys(filled)).toEqual(["draft", "published", "cancelled", "finished"]);
  });

  it("ignores a row whose key is not in keys", () => {
    const filled = fillByKey(["draft", "published"], [{ key: "archived", value: 4 }]);

    expect(filled).toEqual({ draft: 0, published: 0 });
    expect(Object.keys(filled)).toEqual(["draft", "published"]);
  });
});

describe("toAdminMetrics", () => {
  const metrics = toAdminMetrics({
    summary: { sold: 120, revenueCents: 600_000, published: 4 },
    platformFeeCents: 30_000,
    eventRows: [{ key: "published", value: 4 }],
    roleRows: [
      { key: "customer", value: 50 },
      { key: "admin", value: 1 },
    ],
    pendingOrganizers: 2,
    months: MONTHS,
    revenueRows: [
      { key: "2026-09", value: 10 },
      { key: "2026-10", value: 20 },
      { key: "2026-01", value: 999 },
    ],
    newUserRows: [{ key: "2026-10", value: 7 }],
  });

  it("maps sales, fee and pending organizers", () => {
    expect(metrics.ticketsSold).toBe(120);
    expect(metrics.revenueCents).toBe(600_000);
    expect(metrics.platformFeeCents).toBe(30_000);
    expect(metrics.pendingOrganizers).toBe(2);
  });

  it("fills statuses and roles in enum order and does not expose published", () => {
    expect(metrics.eventsByStatus).toEqual({ draft: 0, published: 4, cancelled: 0, finished: 0 });
    expect(Object.keys(metrics.eventsByStatus)).toEqual(["draft", "published", "cancelled", "finished"]);
    expect(metrics.usersByRole).toEqual({ super_admin: 0, admin: 1, organizer: 0, customer: 50 });
    expect(Object.keys(metrics.usersByRole)).toEqual(["super_admin", "admin", "organizer", "customer"]);
    expect(metrics).not.toHaveProperty("published");
  });

  it("builds the revenue series over the window, zero-filled and projected", () => {
    expect(metrics.revenueByMonth.map((point) => point.month)).toEqual([...MONTHS, "2026-11", "2026-12", "2027-01"]);
    expect(metrics.revenueByMonth.map((point) => point.value)).toEqual([0, 0, 0, 0, 10, 20, 18, 22, 25]);
    expect(metrics.revenueByMonth.filter((point) => point.projected)).toHaveLength(3);
  });

  it("builds the new users series without projection when only one month has data", () => {
    expect(metrics.newUsersByMonth.map((point) => point.month)).toEqual(MONTHS);
    expect(metrics.newUsersByMonth.map((point) => point.value)).toEqual([0, 0, 0, 0, 0, 7]);
    expect(metrics.newUsersByMonth.every((point) => !point.projected)).toBe(true);
  });
});
