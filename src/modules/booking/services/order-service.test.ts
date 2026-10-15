import { beforeEach, describe, expect, it, vi } from "vitest";

import type { OrderTicketRow } from "@/modules/booking/order.utils";
import { findOrderRow, findTicketRows, listTicketRows } from "@/modules/booking/services/order-data-service";
import { findMyOrder, listMyOrders } from "@/modules/booking/services/order-service";

vi.mock("@/modules/booking/services/order-data-service", () => ({
  listTicketRows: vi.fn(),
  findTicketRows: vi.fn(),
  findOrderRow: vi.fn(),
}));

const row = (overrides: Partial<OrderTicketRow> = {}): OrderTicketRow => ({
  orderId: "order-1",
  orderCode: "TK-7H3KQ9XM",
  orderStatus: "paid",
  totalCents: 9000,
  buyerName: "Ana Perez",
  buyerEmail: "ana@example.com",
  eventId: "event-1",
  eventSlug: "rock-fest",
  eventTitle: "Rock Fest",
  categoryLabel: "Música",
  coverImageUrl: null,
  coverAlt: null,
  startsAt: new Date("2026-10-20T01:00:00Z"),
  currency: "PEN",
  venueName: "Estadio Nacional",
  venueAddress: "Av. José Díaz s/n",
  venueCity: "Lima",
  ticketId: "ticket-1",
  ticketCode: "A".repeat(22),
  ticketStatus: "valid",
  holderName: "Ana Perez",
  zoneName: "Campo General",
  seatRow: null,
  seatNumber: null,
  refundStatus: null,
  refundReason: null,
  refundAmountCents: null,
  ...overrides,
});

const pendingRow = row({
  orderStatus: "pending",
  ticketId: null,
  ticketCode: null,
  ticketStatus: null,
  holderName: null,
  zoneName: null,
});

beforeEach(() => {
  vi.mocked(listTicketRows).mockReset();
  vi.mocked(findTicketRows).mockReset();
  vi.mocked(findOrderRow).mockReset();
});

describe("listMyOrders", () => {
  it("asks the data service for that user and returns the mapped orders", async () => {
    vi.mocked(listTicketRows).mockResolvedValue([
      row({ orderId: "a", orderCode: "TK-AAAAAAAA", ticketId: "t1" }),
      row({ orderId: "a", orderCode: "TK-AAAAAAAA", ticketId: "t2" }),
      row({ orderId: "b", orderCode: "TK-BBBBBBBB", ticketId: "t3", seatRow: "A", seatNumber: 4 }),
    ]);

    const orders = await listMyOrders("user-1");

    expect(listTicketRows).toHaveBeenCalledWith("user-1");
    expect(orders.map((order) => [order.code, order.tickets.length])).toEqual([
      ["TK-AAAAAAAA", 2],
      ["TK-BBBBBBBB", 1],
    ]);
    expect(orders[1].tickets[0].seatLabel).toBe("Fila A · 4");
  });

  it("returns no orders when the user has none", async () => {
    vi.mocked(listTicketRows).mockResolvedValue([]);
    await expect(listMyOrders("user-1")).resolves.toEqual([]);
  });
});

describe("findMyOrder", () => {
  it("passes the user and the code and returns the order with its tickets", async () => {
    vi.mocked(findTicketRows).mockResolvedValue([row({ ticketId: "t1" }), row({ ticketId: "t2" })]);

    const order = await findMyOrder("user-1", "TK-7H3KQ9XM");

    expect(findTicketRows).toHaveBeenCalledWith("user-1", "TK-7H3KQ9XM");
    expect(order).toMatchObject({ code: "TK-7H3KQ9XM", status: "paid", total: 90 });
    expect(order?.tickets.map((ticket) => ticket.id)).toEqual(["t1", "t2"]);
    expect(findOrderRow).not.toHaveBeenCalled();
  });

  it("returns a pending order that has no tickets yet with an empty list", async () => {
    vi.mocked(findTicketRows).mockResolvedValue([]);
    vi.mocked(findOrderRow).mockResolvedValue(pendingRow);

    const order = await findMyOrder("user-1", "TK-7H3KQ9XM");

    expect(findOrderRow).toHaveBeenCalledWith("user-1", "TK-7H3KQ9XM");
    expect(order).toMatchObject({ code: "TK-7H3KQ9XM", status: "pending", tickets: [] });
  });

  it("returns null when there is no such order for the user (someone else's or missing)", async () => {
    vi.mocked(findTicketRows).mockResolvedValue([]);
    vi.mocked(findOrderRow).mockResolvedValue(null);

    await expect(findMyOrder("user-2", "TK-7H3KQ9XM")).resolves.toBeNull();
    expect(findTicketRows).toHaveBeenCalledWith("user-2", "TK-7H3KQ9XM");
    expect(findOrderRow).toHaveBeenCalledWith("user-2", "TK-7H3KQ9XM");
  });
});
