import { describe, expect, it } from "vitest";

import { buildIcs, getOrderTickets, toFileName, type ExportEvent } from "@/modules/booking/ticket-export";
import type { Order } from "@/modules/booking/booking.types";

const EVENT: ExportEvent = {
  title: "Bad Bunny — World Tour",
  category: "Conciertos",
  date: "2026-11-14",
  startsAt: "22:30",
  venue: "Estadio Nacional",
  address: "Av. José Díaz s/n; Cercado",
  city: "Lima",
};

const ORDER: Order = {
  id: "TK-12345",
  eventId: "evt-001",
  lines: [
    { zoneId: "general", zoneName: "Campo General", quantity: 2, amount: 900, seats: [] },
    {
      zoneId: "norte",
      zoneName: "Tribuna Norte",
      quantity: 1,
      amount: 250,
      seats: [{ id: "norte-B7", row: "B", number: 7, x: 0, y: 0, status: "available" }],
    },
  ],
  count: 3,
  total: 1150,
  currency: "PEN",
  method: "card",
  buyerName: "Ana Pérez",
  email: "ana@mail.com",
};

describe("ticket-export", () => {
  describe("buildIcs", () => {
    const ics = buildIcs(EVENT, ORDER, new Date(Date.UTC(2026, 9, 1, 12, 0, 5)));

    it("uses CRLF line endings and wraps a single VEVENT", () => {
      expect(ics.endsWith("\r\n")).toBe(true);
      expect(ics.split("\r\n").filter((line) => /^BEGIN:VEVENT$/.test(line))).toHaveLength(1);
      expect(ics).toMatch(/^BEGIN:VCALENDAR\r\nVERSION:2.0\r\n/);
    });

    it("includes start, a 3-hour end crossing midnight, stamp and uid", () => {
      expect(ics).toContain("DTSTART:20261114T223000\r\n");
      expect(ics).toContain("DTEND:20261115T013000\r\n");
      expect(ics).toContain("DTSTAMP:20261001T120005Z\r\n");
      expect(ics).toContain("UID:TK-12345@ticketera\r\n");
    });

    it("escapes commas and semicolons in text values", () => {
      expect(ics).toContain("SUMMARY:Bad Bunny — World Tour\r\n");
      expect(ics).toContain("LOCATION:Estadio Nacional\\, Av. José Díaz s/n\\; Cercado\\, Lima\r\n");
      expect(ics).toContain("DESCRIPTION:Pedido TK-12345 · 3 entradas.");
    });
  });

  it("expands an order into one ticket per seat or unit", () => {
    const tickets = getOrderTickets(ORDER);
    expect(tickets.map(({ zoneName, seatLabel }) => [zoneName, seatLabel])).toEqual([
      ["Campo General", undefined],
      ["Campo General", undefined],
      ["Tribuna Norte", "Fila B · 7"],
    ]);
    expect(new Set(tickets.map((ticket) => ticket.seed)).size).toBe(3);
  });

  it("builds safe file names", () => {
    expect(toFileName("Bad Bunny — World Tour")).toBe("bad-bunny-world-tour");
  });
});
