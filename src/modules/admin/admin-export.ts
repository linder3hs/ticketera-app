// Client-only builders of the dashboard export: they only draw the PDF and write
// the xlsx (the pure parts live in `admin-report.ts`). `jspdf` and `exceljs` are
// loaded on demand inside each function, so neither is part of the page bundle.
import type * as ExcelJS from "exceljs";

import type { AdminMetrics, MetricUnit } from "@/modules/admin/admin-metrics.types";
import { buildMonthlyRows, exportFileName, formatMetricValue, toKpiSections } from "@/modules/admin/admin-report";
import { downloadFile } from "@/modules/booking/ticket-export";
import { toLimaDate } from "@/modules/event/event-list.utils";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** Excel number formats: money in soles and plain counts. */
const NUMBER_FORMAT: Record<MetricUnit, string> = { cents: '"S/" #,##0.00', count: "#,##0" };

const typeLabel = (projected: boolean) => (projected ? "Proyección" : "Real");

/** Excel stores money in soles, as a number. */
const toCellNumber = (value: number, unit: MetricUnit) => (unit === "cents" ? value / 100 : value);

/**
 * jsPDF's built-in fonts only cover Latin-1 (same criterion as `pdfText` in
 * `ticket-export.ts`): dashes and curly quotes become ASCII, the (narrow)
 * no-break spaces that `Intl` puts after `S/` become plain spaces, and
 * anything else outside Latin-1 is dropped.
 */
function pdfText(text: string) {
  return text
    .replace(/[—–]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[  ]/g, " ")
    .replace(/[^ -ÿ]/g, "");
}

/** A4 portrait, one page: the 4 KPI sections and the monthly table. */
export async function downloadDashboardPdf(metrics: AdminMetrics): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const now = new Date();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  const margin = 16;
  const right = width - margin;

  // Header band.
  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, width, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text(pdfText("Ticketera - Dashboard de administración"), margin, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Generado el ${toLimaDate(now)} (hora de Lima)`, margin, 20);

  const sectionTitle = (title: string, y: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(79, 70, 229);
    doc.text(pdfText(title), margin, y);
  };

  // KPIs.
  let y = 38;
  for (const section of toKpiSections(metrics)) {
    sectionTitle(section.title, y);
    y += 6;
    doc.setFontSize(10);
    for (const item of section.items) {
      doc.setFont("helvetica", "normal");
      doc.setTextColor(82, 82, 91);
      doc.text(pdfText(item.label), margin, y);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(24, 24, 27);
      doc.text(pdfText(formatMetricValue(item.value, item.unit)), right, y, { align: "right" });
      y += 6;
    }
    y += 4;
  }

  // Monthly table.
  sectionTitle("Ingresos y usuarios nuevos por mes", y + 2);
  y += 10;
  const columns = [
    { title: "Mes", x: margin, align: "left" },
    { title: "Ingresos", x: 110, align: "right" },
    { title: "Usuarios nuevos", x: 155, align: "right" },
    { title: "Tipo", x: 165, align: "left" },
  ] as const;
  const drawRow = (cells: string[]) =>
    cells.forEach((cell, i) => doc.text(pdfText(cell), columns[i].x, y, { align: columns[i].align }));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(82, 82, 91);
  drawRow(columns.map((column) => column.title));
  doc.setDrawColor(212, 212, 216);
  doc.line(margin, y + 2, right, y + 2);
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(24, 24, 27);
  for (const row of buildMonthlyRows(metrics.revenueByMonth, metrics.newUsersByMonth)) {
    drawRow([
      row.label,
      row.revenueCents === null ? "-" : formatMetricValue(row.revenueCents, "cents"),
      row.newUsers === null ? "-" : formatMetricValue(row.newUsers, "count"),
      typeLabel(row.projected),
    ]);
    y += 6;
  }

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
