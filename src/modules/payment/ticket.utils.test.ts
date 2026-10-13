// @vitest-environment node
import { describe, expect, it } from "vitest";

import { generateTicketCode, toNewTickets } from "@/modules/payment/ticket.utils";

const CODE_PATTERN = /^[A-Za-z0-9_-]{22}$/;

describe("generateTicketCode", () => {
  it("encodes the injected bytes in base64url", () => {
    expect(generateTicketCode((size) => Buffer.from(Array.from({ length: size }, (_, i) => i)))).toBe(
      "AAECAwQFBgcICQoLDA0ODw",
    );
  });

  it("uses the URL-safe alphabet without padding", () => {
    const bytes = Buffer.alloc(16, 0xff);
    bytes[0] = 0xfb;
    bytes[1] = 0xef;
    expect(generateTicketCode(() => bytes)).toBe("--___________________w");
  });

  it("asks for exactly 16 bytes", () => {
    const sizes: number[] = [];
    generateTicketCode((size) => {
      sizes.push(size);
      return Buffer.alloc(size);
    });
    expect(sizes).toEqual([16]);
  });

  it("is 22 characters of [A-Za-z0-9_-] with the real generator", () => {
    expect(generateTicketCode()).toMatch(CODE_PATTERN);
  });

  it("does not repeat in 1,000 codes", () => {
    const codes = Array.from({ length: 1000 }, () => generateTicketCode());
    expect(new Set(codes).size).toBe(1000);
    expect(codes.every((code) => CODE_PATTERN.test(code))).toBe(true);
  });
});

describe("toNewTickets", () => {
  it("builds one ticket per order item, in order, with the event, the holder and its own code", () => {
    let calls = 0;
    const tickets = toNewTickets(["item-1", "item-2", "item-3"], "event-1", "Ana Pérez", () => `code-${++calls}`);

    expect(tickets).toEqual([
      { orderItemId: "item-1", eventId: "event-1", holderName: "Ana Pérez", code: "code-1" },
      { orderItemId: "item-2", eventId: "event-1", holderName: "Ana Pérez", code: "code-2" },
      { orderItemId: "item-3", eventId: "event-1", holderName: "Ana Pérez", code: "code-3" },
    ]);
    expect(calls).toBe(3);
  });

  it("uses distinct real codes by default", () => {
    const tickets = toNewTickets(["item-1", "item-2"], "event-1", "Ana Pérez");

    expect(tickets.every((ticket) => CODE_PATTERN.test(ticket.code))).toBe(true);
    expect(tickets[0].code).not.toBe(tickets[1].code);
  });

  it("returns an empty list for no order items", () => {
    expect(toNewTickets([], "event-1", "Ana Pérez", () => "unused")).toEqual([]);
  });
});
