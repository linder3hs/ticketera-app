import { describe, expect, it } from "vitest";

import type { AdminMetrics, MonthlyPoint } from "@/modules/admin/admin-metrics.types";
import { buildMonthlyRows, exportFileName, formatMetricValue, toKpiSections } from "@/modules/admin/admin-report";
import { EVENT_STATUS_LABEL } from "@/modules/event/components/event-status-labels";
import { ROLE_LABEL } from "@/modules/user/components/role-labels";

function point(month: string, value: number, projected = false): MonthlyPoint {
  return { month, label: `label ${month}`, value, projected };
}

const METRICS: AdminMetrics = {
  ticketsSold: 1200,
  revenueCents: 6_000_000,
  platformFeeCents: 300_000,
  eventsByStatus: { draft: 1, published: 4, cancelled: 0, finished: 2 },
  usersByRole: { super_admin: 1, admin: 2, organizer: 3, customer: 50 },
  pendingOrganizers: 5,
  revenueByMonth: [],
  newUsersByMonth: [],
};

describe("formatMetricValue", () => {
  it("formats counts with the es-PE separator", () => {
    expect(formatMetricValue(1234567, "count")).toBe("1,234,567");
  });

  it("formats cents as soles", () => {
    // ICU puts a non-breaking space after the symbol.
    expect(formatMetricValue(123_400, "cents")).toMatch(/^S\/\s1,234$/);
    expect(formatMetricValue(0, "cents")).toMatch(/^S\/\s0$/);
  });

  it("abbreviates a large amount when compact", () => {
    const full = formatMetricValue(123_456_700, "cents");
    const compact = formatMetricValue(123_456_700, "cents", { compact: true });

    expect(compact).toMatch(/^S\/\s/);
    expect(compact).not.toContain("234");
    expect(compact.length).toBeLessThan(full.length);
  });

  it("keeps half-step axis ticks distinct when compact", () => {
    const ticks = [100_000, 150_000, 200_000].map((cents) => formatMetricValue(cents, "cents", { compact: true }));

    expect(new Set(ticks).size).toBe(ticks.length);
  });

  it("abbreviates a large count when compact", () => {
    expect(formatMetricValue(25_000, "count", { compact: true })).not.toContain("000");
    expect(formatMetricValue(12, "count", { compact: true })).toBe("12");
  });
});

describe("toKpiSections", () => {
  const sections = toKpiSections(METRICS);
  const items = sections.flatMap((section) => section.items);
  const byKey = (key: string) => items.find((item) => item.key === key);

  it("has the 4 sections in order and 12 items in total", () => {
    expect(sections.map((section) => section.id)).toEqual(["sales", "events", "users", "moderation"]);
    expect(sections.map((section) => section.title)).toEqual([
      "Ventas",
      "Eventos por estado",
      "Usuarios por rol",
      "Moderación",
    ]);
    expect(items).toHaveLength(12);
  });

  it("lists sales with their units", () => {
    expect(sections[0].items).toEqual([
      { key: "ticketsSold", label: "Entradas vendidas", value: 1200, unit: "count" },
      { key: "revenueCents", label: "Ingresos", value: 6_000_000, unit: "cents" },
      { key: "platformFeeCents", label: "Comisión de la plataforma", value: 300_000, unit: "cents" },
    ]);
  });

  it("labels statuses and roles in Spanish, in enum and ROLES order", () => {
    expect(sections[1].items.map((item) => item.label)).toEqual([
      EVENT_STATUS_LABEL.draft,
      EVENT_STATUS_LABEL.published,
      EVENT_STATUS_LABEL.cancelled,
      EVENT_STATUS_LABEL.finished,
    ]);
    expect(sections[1].items.map((item) => item.value)).toEqual([1, 4, 0, 2]);
    expect(sections[2].items.map((item) => item.label)).toEqual([
      ROLE_LABEL.super_admin,
      ROLE_LABEL.admin,
      ROLE_LABEL.organizer,
      ROLE_LABEL.customer,
    ]);
    expect(sections[2].items.map((item) => item.value)).toEqual([1, 2, 3, 50]);
  });

  it("counts everything except revenue and fee", () => {
    expect(byKey("pendingOrganizers")).toEqual({
      key: "pendingOrganizers",
      label: "Organizadores pendientes",
      value: 5,
      unit: "count",
    });
    expect(items.filter((item) => item.unit === "cents").map((item) => item.key)).toEqual([
      "revenueCents",
      "platformFeeCents",
    ]);
  });
});

describe("buildMonthlyRows", () => {
  const revenue = [point("2026-09", 100), point("2026-10", 200)];
  const users = [point("2026-09", 3), point("2026-10", 5), point("2026-11", 7, true), point("2026-12", 9, true)];

  it("joins both series by month, oldest first", () => {
    const rows = buildMonthlyRows(revenue, [...users].reverse());

    expect(rows.map((row) => row.month)).toEqual(["2026-09", "2026-10", "2026-11", "2026-12"]);
    expect(rows[0]).toEqual({ month: "2026-09", label: "label 2026-09", revenueCents: 100, newUsers: 3, projected: false });
  });

  it("leaves revenue null in months only users project", () => {
    const rows = buildMonthlyRows(revenue, users);

    expect(rows.map((row) => row.revenueCents)).toEqual([100, 200, null, null]);
    expect(rows.map((row) => row.newUsers)).toEqual([3, 5, 7, 9]);
  });

  it("marks a row projected when any of its points is", () => {
    const rows = buildMonthlyRows([...revenue, point("2026-11", 250, true)], users);

    expect(rows.map((row) => row.projected)).toEqual([false, false, true, true]);
    expect(rows[2]).toEqual({ month: "2026-11", label: "label 2026-11", revenueCents: 250, newUsers: 7, projected: true });
  });
});

describe("exportFileName", () => {
  it("uses today's date in Lima", () => {
    expect(exportFileName("pdf", new Date("2026-10-13T03:00:00Z"))).toBe("ticketera-dashboard-2026-10-12.pdf");
  });

  it("changes the extension for Excel", () => {
    expect(exportFileName("xlsx", new Date("2026-10-13T03:00:00Z"))).toBe("ticketera-dashboard-2026-10-12.xlsx");
  });
});
