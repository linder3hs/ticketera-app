import { QR_QUIET_ZONE, buildQrMatrix } from "@/lib/qr";
import { formatEventDateParts } from "@/modules/event/event.utils";
import type { MyOrder, MyOrderEvent, MyTicket } from "@/modules/booking/order.types";

export type ExportEvent = Pick<MyOrderEvent, "title" | "category" | "date" | "startsAt" | "venue" | "address" | "city">;

/** Assumed show length for the calendar entry: there is no end time in the data. */
const EVENT_DURATION_HOURS = 3;

/** Tickets that can still be used: only these get a QR and a PDF page. */
export function getValidTickets(order: Pick<MyOrder, "tickets">): MyTicket[] {
  return order.tickets.filter((ticket) => ticket.status === "valid");
}

/** Escapes TEXT values for iCalendar (RFC 5545 §3.3.11). */
function escapeIcs(text: string) {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "YYYYMMDDTHHMMSS" floating local time (the venue's time). */
function toIcsLocal(date: string, time: string, addHours = 0) {
  const [year, month, day] = date.split("-").map(Number);
  const [hours, minutes] = time.split(":").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day, hours + addHours, minutes));
  return (
    `${value.getUTCFullYear()}${pad(value.getUTCMonth() + 1)}${pad(value.getUTCDate())}` +
    `T${pad(value.getUTCHours())}${pad(value.getUTCMinutes())}00`
  );
}

function toIcsUtc(date: Date) {
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** An iCalendar file with the event, for "Agregar al calendario". */
export function buildIcs(event: ExportEvent, order: Pick<MyOrder, "code" | "tickets">, now = new Date()): string {
  const count = order.tickets.length;
  const tickets = count === 1 ? "1 entrada" : `${count} entradas`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Ticketera//Entradas//ES",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${order.code}@ticketera`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART:${toIcsLocal(event.date, event.startsAt)}`,
    `DTEND:${toIcsLocal(event.date, event.startsAt, EVENT_DURATION_HOURS)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `LOCATION:${escapeIcs(`${event.venue}, ${event.address}, ${event.city}`)}`,
    `DESCRIPTION:${escapeIcs(`Pedido ${order.code} · ${tickets}. Muestra el QR de cada entrada en el ingreso.`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.join("\r\n")}\r\n`;
}

/** Lowercase, accent-free, dash-separated file name. */
export function toFileName(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Makes the browser save `data` as `fileName`. */
export function downloadFile(fileName: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadIcs(event: ExportEvent, order: Pick<MyOrder, "code" | "tickets">) {
  downloadFile(`${toFileName(event.title)}.ics`, buildIcs(event, order), "text/calendar;charset=utf-8");
}

/** jsPDF's built-in fonts only cover Latin-1: swap the dashes outside it. */
function pdfText(text: string) {
  return text.replace(/[—–]/g, "-").replace(/[“”]/g, '"');
}

/**
 * A PDF with one valid ticket per page, or `null` when none is valid. `jspdf`
 * is loaded on demand so it isn't part of the page bundle; it also runs on the
 * server (the order email attaches it).
 */
export async function buildTicketsPdf(event: ExportEvent, order: MyOrder): Promise<ArrayBuffer | null> {
  const tickets = getValidTickets(order);
  if (tickets.length === 0) return null;

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a5" });
  const date = formatEventDateParts(event.date).long;
  const width = doc.internal.pageSize.getWidth();
  const margin = 12;

  tickets.forEach((ticket, index) => {
    if (index > 0) doc.addPage();

    // Header band.
    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, width, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Ticketera", margin, 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Entrada ${index + 1} de ${tickets.length}`, width - margin, 14, { align: "right" });

    // Event.
    doc.setTextColor(79, 70, 229);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(event.category.toUpperCase(), margin, 34);
    doc.setTextColor(24, 24, 27);
    doc.setFontSize(18);
    const titleLines: string[] = doc.splitTextToSize(pdfText(event.title), width - margin * 2);
    doc.text(titleLines, margin, 42);
    let y = 42 + titleLines.length * 7;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(82, 82, 91);
    doc.text(`${date} · ${event.startsAt} h`, margin, y);
    doc.text(pdfText(`${event.venue}, ${event.address}, ${event.city}`), margin, y + 5, { maxWidth: width - margin * 2 });
    y += 18;

    // Details.
    const details = [
      ["Zona", ticket.zoneName],
      ["Asiento", ticket.seatLabel ?? "Sin asiento asignado"],
      ["Pedido", order.code],
      ["Titular", ticket.holderName],
    ];
    details.forEach(([label, value], i) => {
      const x = margin + (i % 2) * ((width - margin * 2) / 2);
      const rowY = y + Math.floor(i / 2) * 14;
      doc.setFontSize(8);
      doc.setTextColor(82, 82, 91);
      doc.text(label, x, rowY);
      doc.setFontSize(11);
      doc.setTextColor(24, 24, 27);
      doc.setFont("helvetica", "bold");
      doc.text(pdfText(value), x, rowY + 5);
      doc.setFont("helvetica", "normal");
    });
    y += 34;

    // Perforation and QR.
    doc.setDrawColor(212, 212, 216);
    doc.setLineDashPattern([2, 2], 0);
    doc.line(margin, y, width - margin, y);
    doc.setLineDashPattern([], 0);

    // The same matrix as on screen, quiet zone included in `qrSize`.
    const matrix = buildQrMatrix(ticket.code);
    const qrSize = 60;
    const cell = qrSize / (matrix.length + QR_QUIET_ZONE * 2);
    const qrX = (width - qrSize) / 2;
    const qrY = y + 10;
    doc.setFillColor(24, 24, 27);
    matrix.forEach((row, rowIndex) => {
      row.forEach((isDark, colIndex) => {
        if (!isDark) return;
        doc.rect(qrX + (colIndex + QR_QUIET_ZONE) * cell, qrY + (rowIndex + QR_QUIET_ZONE) * cell, cell, cell, "F");
      });
    });

    doc.setFontSize(9);
    doc.setTextColor(82, 82, 91);
    doc.text("Muestra este código en el ingreso.", width / 2, qrY + qrSize + 8, {
      align: "center",
      maxWidth: width - margin * 2,
    });
  });

  return doc.output("arraybuffer");
}

export async function downloadTicketsPdf(event: ExportEvent, order: MyOrder) {
  const pdf = await buildTicketsPdf(event, order);
  if (pdf) downloadFile(`entradas-${order.code}.pdf`, pdf, "application/pdf");
}
