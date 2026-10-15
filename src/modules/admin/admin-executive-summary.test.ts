import { describe, expect, it } from "vitest";

import {
  EMPTY_SERIES_TEXT,
  buildExecutiveSummary,
  buildProjectionTotals,
  buildReportMeta,
  buildSummaryCards,
  formatPercentChange,
} from "@/modules/admin/admin-executive-summary";
import type { AdminMetrics, MonthlyPoint } from "@/modules/admin/admin-metrics.types";
import { formatMetricValue } from "@/modules/admin/admin-report";

const REAL_MONTHS = [
  ["2026-05", "may 2026"],
  ["2026-06", "jun 2026"],
  ["2026-07", "jul 2026"],
  ["2026-08", "ago 2026"],
  ["2026-09", "set 2026"],
  ["2026-10", "oct 2026"],
];
const PROJECTED_MONTHS = [
  ["2026-11", "nov 2026"],
  ["2026-12", "dic 2026"],
  ["2027-01", "ene 2027"],
];

/** Real points from May to October 2026, then the given projected ones (not a linear fit on purpose). */
function series(actual: number[], projected: number[] = []): MonthlyPoint[] {
  const toPoint = ([month, label]: string[], value: number, isProjected: boolean) => ({
    month,
    label,
    value,
    projected: isProjected,
  });
  return [
    ...actual.map((value, i) => toPoint(REAL_MONTHS[i], value, false)),
    ...projected.map((value, i) => toPoint(PROJECTED_MONTHS[i], value, true)),
  ];
}

function metrics(overrides: Partial<AdminMetrics> = {}): AdminMetrics {
  return {
    ticketsSold: 1200,
    revenueCents: 6_000_000,
    platformFeeCents: 300_000,
    eventsByStatus: { draft: 1, published: 4, cancelled: 0, finished: 2 },
    usersByRole: { super_admin: 1, admin: 2, organizer: 3, customer: 50 },
    pendingOrganizers: 3,
    revenueByMonth: series([40_000, 0, 55_000, 70_000, 100_000, 113_700], [120_000, 135_000, 150_000]),
    newUsersByMonth: series([2, 5, 3, 6, 8, 10], [11, 13, 17]),
    ...overrides,
  };
}

const ZEROS = [0, 0, 0, 0, 0, 0];

const FIXTURES = {
  full: metrics(),
  revenueDown: metrics({
    revenueByMonth: series([40_000, 0, 55_000, 70_000, 100_000, 86_300]),
    newUsersByMonth: series([1, 0, 0, 0, 0, 4]),
    pendingOrganizers: 0,
  }),
  revenueUpBelowOneSol: metrics({
    revenueByMonth: series([40_000, 0, 55_000, 70_000, 100_000, 100_040]),
    newUsersByMonth: series([3, 4, 2, 5, 0, 0], [1, 1, 0]),
  }),
  revenueDownBelowOneSol: metrics({ revenueByMonth: series([40_000, 0, 55_000, 70_000, 100_040, 100_000]) }),
  revenueFromZero: metrics({ revenueByMonth: series([30_000, 20_000, 0, 0, 0, 45_000], [50_000, 60_000, 70_000]) }),
  revenueBothZero: metrics({ revenueByMonth: series([50_000, 30_000, 0, 0, 0, 0]) }),
  emptyZeros: metrics({ revenueByMonth: series(ZEROS), newUsersByMonth: series(ZEROS), pendingOrganizers: 0 }),
  emptyArrays: metrics({ revenueByMonth: [], newUsersByMonth: [] }),
  revenueEmptyUsersProjected: metrics({ revenueByMonth: [], newUsersByMonth: series([2, 5, 3, 6, 8, 10], [11, 13, 17]) }),
  revenueProjectedUsersEmpty: metrics({ newUsersByMonth: series(ZEROS) }),
  largeUserCounts: metrics({ newUsersByMonth: series([0, 0, 0, 0, 1000, 1500], [1600, 1800, 2000]) }),
};

const NOW = new Date("2026-10-12T19:05:00Z");
const NOW_LATE = new Date("2026-11-01T03:00:00Z");

const money = (cents: number) => formatMetricValue(cents, "cents");
const textOf = (fixture: AdminMetrics, index: number) => buildExecutiveSummary(fixture)[index].text;

describe("formatPercentChange", () => {
  it.each([
    [1125, 1000, "+12.5 %"],
    [97, 100, "-3 %"],
    [100, 100, "0 %"],
    [0, 500, "-100 %"],
    [2, 3, "-33.3 %"],
    [10000, 10001, "0 %"],
  ])("(%d, %d) -> %s", (current, previous, expected) => {
    expect(formatPercentChange(current, previous)).toBe(expected);
  });

  it("returns null when the previous value is 0", () => {
    expect(formatPercentChange(5, 0)).toBeNull();
  });
});

describe("buildExecutiveSummary", () => {
  it("returns the 5 findings in order", () => {
    for (const fixture of Object.values(FIXTURES)) {
      expect(buildExecutiveSummary(fixture).map((finding) => finding.title)).toEqual([
        "Ingresos del mes",
        "Proyección de ingresos",
        "Usuarios nuevos",
        "Catálogo de eventos",
        "Organizadores pendientes",
      ]);
    }
  });

  describe("(1) revenue of the month", () => {
    it("compares the current month with a signed difference when it went up", () => {
      expect(textOf(FIXTURES.full, 0)).toBe(
        `Ingresos de oct 2026 (mes en curso, parcial): ${money(113_700)}, +13.7 % (+${money(13_700)}) frente a set 2026.`,
      );
      expect(textOf(FIXTURES.full, 0)).toMatch(/\(\+S\/\s137\)/);
    });

    it("uses a minus sign when it went down", () => {
      expect(textOf(FIXTURES.revenueDown, 0)).toBe(
        `Ingresos de oct 2026 (mes en curso, parcial): ${money(86_300)}, -13.7 % (-${money(13_700)}) frente a set 2026.`,
      );
      expect(textOf(FIXTURES.revenueDown, 0)).toMatch(/\(-S\/\s137\)/);
    });

    it("drops the sign when the difference rounds to S/ 0, either way", () => {
      expect(textOf(FIXTURES.revenueUpBelowOneSol, 0)).toBe(
        `Ingresos de oct 2026 (mes en curso, parcial): ${money(100_040)}, 0 % (${money(40)}) frente a set 2026.`,
      );
      expect(textOf(FIXTURES.revenueDownBelowOneSol, 0)).toBe(
        `Ingresos de oct 2026 (mes en curso, parcial): ${money(100_000)}, 0 % (${money(40)}) frente a set 2026.`,
      );
      expect(textOf(FIXTURES.revenueDownBelowOneSol, 0)).toMatch(/\(S\/\s0\)/);
    });

    it("skips the change when the previous month had no revenue", () => {
      expect(textOf(FIXTURES.revenueFromZero, 0)).toBe(
        `Ingresos de oct 2026 (mes en curso, parcial): ${money(45_000)}. En set 2026 no hubo ingresos, así que no se calcula la variación.`,
      );
    });

    it("says neither month had revenue when both are 0", () => {
      expect(textOf(FIXTURES.revenueBothZero, 0)).toBe(
        `Ingresos de oct 2026 (mes en curso, parcial): ${money(0)}. En set 2026 tampoco hubo ingresos.`,
      );
    });

    it("says there are no sales yet when the series is empty", () => {
      const text = "Aún no hay ventas registradas: no hay órdenes pagadas en los últimos 6 meses.";

      expect(textOf(FIXTURES.emptyZeros, 0)).toBe(text);
      expect(textOf(FIXTURES.emptyArrays, 0)).toBe(text);
    });
  });

  describe("(2) revenue projection", () => {
    it("reads the last projected point", () => {
      expect(textOf(FIXTURES.full, 1)).toBe(
        `Si se mantiene la tendencia, ene 2027 cerraría con ${money(150_000)} de ingresos.`,
      );
    });

    it("explains why there is no projection", () => {
      const text = "Sin proyección: se necesitan al menos 2 meses con ingresos en los últimos 6.";

      expect(textOf(FIXTURES.revenueDown, 1)).toBe(text);
      expect(textOf(FIXTURES.emptyArrays, 1)).toBe(text);
    });
  });

  describe("(3) new users", () => {
    it("compares the current month and adds the projection", () => {
      expect(textOf(FIXTURES.full, 2)).toBe(
        "Usuarios nuevos de oct 2026 (mes en curso, parcial): 10, +25 % frente a set 2026. Proyección para ene 2027: 17.",
      );
    });

    it("skips the change when the previous month had no sign-ups, without projection", () => {
      expect(textOf(FIXTURES.revenueDown, 2)).toBe(
        "Usuarios nuevos de oct 2026 (mes en curso, parcial): 4. En set 2026 no hubo registros, así que no se calcula la variación. Sin proyección: se necesitan al menos 2 meses con registros.",
      );
    });

    it("says neither month had sign-ups when both are 0", () => {
      expect(textOf(FIXTURES.revenueUpBelowOneSol, 2)).toBe(
        "Usuarios nuevos de oct 2026 (mes en curso, parcial): 0. En set 2026 tampoco hubo registros. Proyección para ene 2027: 0.",
      );
    });

    it("formats the counts", () => {
      expect(textOf(FIXTURES.largeUserCounts, 2)).toBe(
        "Usuarios nuevos de oct 2026 (mes en curso, parcial): 1,500, +50 % frente a set 2026. Proyección para ene 2027: 2,000.",
      );
    });

    it("uses the dashboard's empty message, without suffix, when the series is empty", () => {
      expect(textOf(FIXTURES.emptyZeros, 2)).toBe(EMPTY_SERIES_TEXT.newUsers);
      expect(textOf(FIXTURES.emptyArrays, 2)).toBe(EMPTY_SERIES_TEXT.newUsers);
    });
  });

  it("(4) lists the events by status", () => {
    expect(textOf(FIXTURES.full, 3)).toBe("Publicados: 4 · Borradores: 1 · Finalizados: 2 · Cancelados: 0.");
  });

  describe("(5) pending organizers", () => {
    it("asks for attention when there are pending requests", () => {
      expect(buildExecutiveSummary(FIXTURES.full)[4]).toEqual({
        title: "Organizadores pendientes",
        text: "Solicitudes de organizador por revisar: 3.",
        attention: true,
      });
    });

    it("has no attention flag when there are none", () => {
      const finding = buildExecutiveSummary(FIXTURES.emptyZeros)[4];

      expect(finding).not.toHaveProperty("attention");
      expect(finding).toEqual({ title: "Organizadores pendientes", text: "No hay solicitudes de organizador por revisar." });
    });
  });

  it("treats both series independently", () => {
    const [revenue, projection, users] = buildExecutiveSummary(FIXTURES.revenueEmptyUsersProjected);

    expect(revenue.text).toBe("Aún no hay ventas registradas: no hay órdenes pagadas en los últimos 6 meses.");
    expect(projection.text).toBe("Sin proyección: se necesitan al menos 2 meses con ingresos en los últimos 6.");
    expect(users.text).toContain(" Proyección para ene 2027: 17.");

    const [, revenueProjection, emptyUsers] = buildExecutiveSummary(FIXTURES.revenueProjectedUsersEmpty);
    expect(revenueProjection.text).toContain("cerraría con");
    expect(emptyUsers.text).toBe(EMPTY_SERIES_TEXT.newUsers);
  });
});

describe("buildReportMeta", () => {
  it("dates the report in Lima and spans the real months", () => {
    expect(buildReportMeta(FIXTURES.full, NOW)).toEqual({
      headerLabel: "Reporte de métricas · 2026-10-12",
      metaLine: "Generado el 2026-10-12, 14:05 (hora de Lima) · Tendencias de may 2026 a oct 2026",
    });
  });

  it("uses the Lima day and time across midnight UTC", () => {
    const meta = buildReportMeta(FIXTURES.full, NOW_LATE);

    expect(meta.headerLabel).toBe("Reporte de métricas · 2026-10-31");
    expect(meta.metaLine).toMatch(/^Generado el 2026-10-31, 22:00 \(hora de Lima\)/);
  });

  it("ends at the time zone when there are no real months", () => {
    expect(buildReportMeta(FIXTURES.emptyArrays, NOW).metaLine).toBe("Generado el 2026-10-12, 14:05 (hora de Lima)");
  });
});

describe("buildSummaryCards", () => {
  it("lists revenue, tickets and fee with formatted values and their own source", () => {
    expect(buildSummaryCards(FIXTURES.full)).toEqual([
      {
        label: "Ingresos",
        value: money(6_000_000),
        detail: "Valor de las entradas vendidas en eventos publicados y finalizados.",
      },
      {
        label: "Entradas vendidas",
        value: "1,200",
        detail: "Zonas generales y asientos numerados de eventos publicados y finalizados.",
      },
      {
        label: "Comisión de la plataforma",
        value: money(300_000),
        detail: "Suma de la comisión guardada en las órdenes pagadas.",
      },
    ]);
  });

  it("has no figures in the details", () => {
    for (const card of buildSummaryCards(FIXTURES.full)) expect(card.detail).not.toMatch(/[\d%]/);
  });
});

describe("buildProjectionTotals", () => {
  it("adds up only the projected points of each series", () => {
    expect(buildProjectionTotals(FIXTURES.full)).toEqual([
      { label: "Ingresos proyectados", value: money(405_000), detail: "Suma de nov 2026 a ene 2027" },
      { label: "Usuarios nuevos proyectados", value: "41", detail: "Suma de nov 2026 a ene 2027" },
    ]);
  });

  it("explains the missing projection per series", () => {
    expect(buildProjectionTotals(FIXTURES.emptyArrays)).toEqual([
      { label: "Ingresos proyectados", value: "Sin proyección", detail: "Se necesitan al menos 2 meses con ingresos" },
      {
        label: "Usuarios nuevos proyectados",
        value: "Sin proyección",
        detail: "Se necesitan al menos 2 meses con registros",
      },
    ]);
  });

  it("treats both series independently", () => {
    const [revenue, users] = buildProjectionTotals(FIXTURES.revenueEmptyUsersProjected);
    expect(revenue.value).toBe("Sin proyección");
    expect(users).toEqual({ label: "Usuarios nuevos proyectados", value: "41", detail: "Suma de nov 2026 a ene 2027" });

    const [projectedRevenue, emptyUsers] = buildProjectionTotals(FIXTURES.revenueProjectedUsersEmpty);
    expect(projectedRevenue.value).toBe(money(405_000));
    expect(emptyUsers.value).toBe("Sin proyección");
  });
});

describe("Latin-1 output", () => {
  it.each(Object.entries(FIXTURES))("%s only uses U+0020-U+00FF", (_, fixture) => {
    const strings = [
      ...Object.values(EMPTY_SERIES_TEXT),
      ...buildExecutiveSummary(fixture).flatMap(({ title, text }) => [title, text]),
      ...[NOW, NOW_LATE].flatMap((now) => Object.values(buildReportMeta(fixture, now))),
      ...buildSummaryCards(fixture).flatMap(({ label, value, detail }) => [label, value, detail]),
      ...buildProjectionTotals(fixture).flatMap(({ label, value, detail }) => [label, value, detail]),
    ];

    for (const value of strings) expect(value).toMatch(/^[ -ÿ]*$/);
  });
});
