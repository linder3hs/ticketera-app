// Client-only downloads of the dashboard export: the PDF is drawn in `admin-pdf-draw.ts`
// and the xlsx is written here (the pure parts live in `admin-report.ts`). `jspdf` and
// `exceljs` are loaded on demand, so neither is part of the page bundle.
import type * as ExcelJS from "exceljs";

import type { AdminMetrics, MetricUnit } from "@/modules/admin/admin-metrics.types";
import { buildDashboardPdf } from "@/modules/admin/admin-pdf-draw";
import { buildMonthlyRows, exportFileName, toKpiSections } from "@/modules/admin/admin-report";
import { downloadFile } from "@/modules/booking/ticket-export";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** Excel number formats: money in soles and plain counts. */
const NUMBER_FORMAT: Record<MetricUnit, string> = { cents: '"S/" #,##0.00', count: "#,##0" };

const typeLabel = (projected: boolean) => (projected ? "Proyección" : "Real");

/** Excel stores money in soles, as a number. */
const toCellNumber = (value: number, unit: MetricUnit) => (unit === "cents" ? value / 100 : value);

/** A4 portrait, 3 pages (see `buildDashboardPdf`); the same `now` dates the report and names the file. */
export async function downloadDashboardPdf(metrics: AdminMetrics): Promise<void> {
  const now = new Date();
  const doc = await buildDashboardPdf(metrics, now);
  doc.save(exportFileName("pdf", now));
}

/** Sheets "Resumen" (the 12 KPIs) and "Mensual"; amounts and counts are numeric cells. */
export async function downloadDashboardXlsx(metrics: AdminMetrics): Promise<void> {
  // `exceljs` is CommonJS/UMD (`main`/`browser`, no `module`/`exports`): depending on
  // the bundler's interop, the dynamic import exposes it as `default` or as the namespace.
  const exceljs: typeof ExcelJS & { default?: typeof ExcelJS } = await import("exceljs");
  const { Workbook } = exceljs.default ?? exceljs;
  const now = new Date();
  const workbook = new Workbook();

  const summary = workbook.addWorksheet("Resumen");
  summary.columns = [
    { header: "Sección", key: "section", width: 22 },
    { header: "Indicador", key: "label", width: 30 },
    { header: "Valor", key: "value", width: 16 },
  ];
  for (const section of toKpiSections(metrics)) {
    for (const item of section.items) {
      const row = summary.addRow({
        section: section.title,
        label: item.label,
        value: toCellNumber(item.value, item.unit),
      });
      // The column mixes money and counts, so the format goes per cell.
      row.getCell("value").numFmt = NUMBER_FORMAT[item.unit];
    }
  }

  const monthly = workbook.addWorksheet("Mensual");
  monthly.columns = [
    { header: "Mes", key: "month", width: 10 },
    { header: "Ingresos (S/)", key: "revenue", width: 16, style: { numFmt: NUMBER_FORMAT.cents } },
    { header: "Usuarios nuevos", key: "newUsers", width: 16, style: { numFmt: NUMBER_FORMAT.count } },
    { header: "Tipo", key: "type", width: 12 },
  ];
  for (const row of buildMonthlyRows(metrics.revenueByMonth, metrics.newUsersByMonth)) {
    // `null` (a series without that month) leaves the cell empty.
    monthly.addRow({
      month: row.month,
      revenue: row.revenueCents === null ? null : toCellNumber(row.revenueCents, "cents"),
      newUsers: row.newUsers,
      type: typeLabel(row.projected),
    });
  }

  for (const sheet of [summary, monthly]) sheet.getRow(1).font = { bold: true };

  const buffer = await workbook.xlsx.writeBuffer();
  downloadFile(exportFileName("xlsx", now), buffer, XLSX_TYPE);
}
