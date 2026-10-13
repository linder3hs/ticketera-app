// @vitest-environment node
import { describe, expect, it } from "vitest";

import { EMPTY_SERIES_TEXT } from "@/modules/admin/admin-executive-summary";
import type { AdminMetrics } from "@/modules/admin/admin-metrics.types";
import { buildDashboardPdf } from "@/modules/admin/admin-pdf-draw";
import { recentMonths, toMonthlySeries } from "@/modules/admin/admin-series.utils";

// Without `compress`, `output()` keeps each `doc.text` call in plain text, so only
// strings drawn in a single call are searched (short titles and one-line messages).
const NOW = new Date("2026-10-12T19:05:00Z");
const MONTHS = recentMonths(NOW, 6);
const ZEROS = [0, 0, 0, 0, 0, 0];
const REVENUE = [40_000, 0, 55_000, 70_000, 100_000, 113_700];
const NEW_USERS = [2, 5, 3, 6, 8, 10];

function metrics(overrides: Partial<AdminMetrics> = {}): AdminMetrics {
  return {
    ticketsSold: 1200,
    revenueCents: 6_000_000,
    platformFeeCents: 300_000,
    eventsByStatus: { draft: 1, published: 4, cancelled: 0, finished: 2 },
    usersByRole: { super_admin: 1, admin: 2, organizer: 3, customer: 50 },
    pendingOrganizers: 3,
    revenueByMonth: toMonthlySeries(MONTHS, REVENUE),
    newUsersByMonth: toMonthlySeries(MONTHS, NEW_USERS),
    ...overrides,
  };
}

const isProjected = (point: { projected: boolean }) => point.projected;

describe("buildDashboardPdf", () => {
  it("draws the 3 pages with both projections and pending organizers", async () => {
    const full = metrics();
    expect(full.revenueByMonth.some(isProjected)).toBe(true);
    expect(full.newUsersByMonth.some(isProjected)).toBe(true);

    const doc = await buildDashboardPdf(full, NOW);
    const output = doc.output();

    expect(doc.getNumberOfPages()).toBe(3);
    for (const text of ["Resumen ejecutivo", "Tendencias", "Notas y metodología", "Página 3 de 3", "Requiere atención"]) {
      expect(output).toContain(text);
    }
  });

  it("keeps 3 pages with both series empty and no pending organizers", async () => {
    const empty = metrics({
      revenueByMonth: toMonthlySeries(MONTHS, ZEROS),
      newUsersByMonth: toMonthlySeries(MONTHS, ZEROS),
      pendingOrganizers: 0,
    });
    expect([...empty.revenueByMonth, ...empty.newUsersByMonth].some(isProjected)).toBe(false);

    const doc = await buildDashboardPdf(empty, NOW);
    const output = doc.output();

    expect(doc.getNumberOfPages()).toBe(3);
    expect(output).toContain(EMPTY_SERIES_TEXT.newUsers);
    expect(output).toContain("primeros pagos");
    expect(output).not.toContain("Requiere atención");
  });

  it("keeps 3 pages with data in both series and no projection", async () => {
    // A horizon of 0 months leaves only the real points.
    const withoutProjection = metrics({
      revenueByMonth: toMonthlySeries(MONTHS, REVENUE, 0),
      newUsersByMonth: toMonthlySeries(MONTHS, NEW_USERS, 0),
    });
    expect([...withoutProjection.revenueByMonth, ...withoutProjection.newUsersByMonth].some(isProjected)).toBe(false);

    const doc = await buildDashboardPdf(withoutProjection, NOW);

    expect(doc.getNumberOfPages()).toBe(3);
  });
});
