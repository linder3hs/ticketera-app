import { describe, expect, it } from "vitest";

import { buildIcs, getValidTickets, toFileName, type ExportEvent } from "@/modules/booking/ticket-export";
import type { MyTicket } from "@/modules/booking/order.types";

const EVENT: ExportEvent = {
  title: "Bad Bunny — World Tour",
  category: "Conciertos",
  date: "2026-11-14",
  startsAt: "22:30",
  venue: "Estadio Nacional",
  address: "Av. José Díaz s/n; Cercado",
  city: "Lima",
};

function makeTicket(id: string, status: MyTicket["status"] = "valid"): MyTicket {
  return { id, code: `code-${id}`, zoneName: "Campo General", seatLabel: null, holderName: "Ana Pérez", status };
}

const ORDER = {
  code: "TK-AB12CD34",
  tickets: [makeTicket("1"), makeTicket("2"), makeTicket("3")],
};

describe("ticket-export", () => {
  describe("buildIcs", () => {
    const ics = buildIcs(EVENT, ORDER, new Date(Date.UTC(2026, 9, 1, 12, 0, 5)));

    it("uses CRLF line endings and wraps a single VEVENT", () => {
      expect(ics.endsWith("\r\n")).toBe(true);
      expect(ics.split("\r\n").filter((line) => /^BEGIN:VEVENT$/.test(line))).toHaveLength(1);
      expect(ics).toMatch(/^BEGIN:VCALENDAR\r\nVERSION:2.0\r\n/);
    });

    it("includes start, a 3-hour end crossing midnight, stamp and uid from the order code", () => {
      expect(ics).toContain("DTSTART:20261114T223000\r\n");
      expect(ics).toContain("DTEND:20261115T013000\r\n");
      expect(ics).toContain("DTSTAMP:20261001T120005Z\r\n");
      expect(ics).toContain("UID:TK-AB12CD34@ticketera\r\n");
    });

    it("escapes commas and semicolons in text values", () => {
      expect(ics).toContain("SUMMARY:Bad Bunny — World Tour\r\n");
      expect(ics).toContain("LOCATION:Estadio Nacional\\, Av. José Díaz s/n\\; Cercado\\, Lima\r\n");
    });

    it("counts the tickets of the order", () => {
      expect(ics).toContain("DESCRIPTION:Pedido TK-AB12CD34 · 3 entradas.");
      const single = buildIcs(EVENT, { code: ORDER.code, tickets: [makeTicket("1")] });
      expect(single).toContain("· 1 entrada.");
    });
  });

  describe("getValidTickets", () => {
    it("keeps only the valid tickets", () => {
      const order = {
        tickets: [makeTicket("1"), makeTicket("2", "used"), makeTicket("3", "cancelled"), makeTicket("4", "refunded"), makeTicket("5")],
      };
      expect(getValidTickets(order).map((ticket) => ticket.id)).toEqual(["1", "5"]);
    });

    it("returns an empty list when none is valid", () => {
      expect(getValidTickets({ tickets: [makeTicket("1", "used")] })).toEqual([]);
    });
  });

  it("builds safe file names", () => {
    expect(toFileName("Bad Bunny — World Tour")).toBe("bad-bunny-world-tour");
  });
});
