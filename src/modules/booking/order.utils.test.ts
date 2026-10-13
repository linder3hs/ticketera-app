import { describe, expect, it } from "vitest";

import type { MyOrder, MyTicket } from "@/modules/booking/order.types";
import {
  getConfirmationView,
  getOrderPollInterval,
  ORDER_POLL_INTERVAL_MS,
  ORDER_POLL_MAX_POLLS,
  splitOrdersByDate,
  toMyOrders,
  type OrderTicketRow,
} from "@/modules/booking/order.utils";

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
  coverImageUrl: "https://images.unsplash.com/photo-1",
  coverAlt: "Escenario",
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
  ...overrides,
});

const noTicket: Partial<OrderTicketRow> = {
  ticketId: null,
  ticketCode: null,
  ticketStatus: null,
  holderName: null,
  zoneName: null,
};

describe("toMyOrders", () => {
  it("groups the rows by order keeping their order", () => {
    const orders = toMyOrders([
      row({ orderId: "b", orderCode: "TK-BBBBBBBB", ticketId: "t1" }),
      row({ orderId: "a", orderCode: "TK-AAAAAAAA", ticketId: "t2" }),
      row({ orderId: "b", orderCode: "TK-BBBBBBBB", ticketId: "t3" }),
    ]);
    expect(orders.map((order) => order.id)).toEqual(["b", "a"]);
    expect(orders[0].tickets.map((ticket) => ticket.id)).toEqual(["t1", "t3"]);
    expect(orders[1].tickets.map((ticket) => ticket.id)).toEqual(["t2"]);
  });

  it("keeps the tickets of an order with several in the row order", () => {
    const [order] = toMyOrders([
      row({ ticketId: "t1", ticketCode: "C".repeat(22) }),
      row({ ticketId: "t2", ticketCode: "D".repeat(22) }),
      row({ ticketId: "t3", ticketCode: "E".repeat(22) }),
    ]);
    expect(order.tickets.map((ticket) => ticket.code)).toEqual(["C".repeat(22), "D".repeat(22), "E".repeat(22)]);
  });

  it("converts cents to currency units", () => {
    expect(toMyOrders([row({ totalCents: 12550 })])[0].total).toBe(125.5);
  });

  it("gives the event day and time in Lima", () => {
    // 2026-10-20 01:00 UTC is still 2026-10-19 20:00 in Lima (UTC-5).
    const { event } = toMyOrders([row({ startsAt: new Date("2026-10-20T01:00:00Z") })])[0];
    expect(event.date).toBe("2026-10-19");
    expect(event.startsAt).toBe("20:00");
  });

  it("labels the seat of a numbered zone and leaves general admission without one", () => {
    const [order] = toMyOrders([
      row({ ticketId: "t1", seatRow: "A", seatNumber: 4 }),
      row({ ticketId: "t2", seatRow: null, seatNumber: null }),
    ]);
    expect(order.tickets.map((ticket) => ticket.seatLabel)).toEqual(["Fila A · 4", null]);
  });

  it("maps the ticket columns", () => {
    const [order] = toMyOrders([row({ ticketStatus: "used", holderName: "Luis", zoneName: "Platea" })]);
    expect(order.tickets[0]).toEqual({
      id: "ticket-1",
      code: "A".repeat(22),
      zoneName: "Platea",
      seatLabel: null,
      holderName: "Luis",
      status: "used",
    });
  });

  it("maps the event and the buyer", () => {
    const [order] = toMyOrders([row()]);
    expect(order).toMatchObject({
      id: "order-1",
      code: "TK-7H3KQ9XM",
      status: "paid",
      total: 90,
      currency: "PEN",
      buyerName: "Ana Perez",
      buyerEmail: "ana@example.com",
    });
    expect(order.event).toEqual({
      id: "event-1",
      slug: "rock-fest",
      title: "Rock Fest",
      category: "Música",
      imageUrl: "https://images.unsplash.com/photo-1",
      imageAlt: "Escenario",
      date: "2026-10-19",
      startsAt: "20:00",
      venue: "Estadio Nacional",
      address: "Av. José Díaz s/n",
      city: "Lima",
      currency: "PEN",
    });
  });

  it("uses an empty image and the title as alt when the event has no cover", () => {
    const { event } = toMyOrders([row({ coverImageUrl: null, coverAlt: null })])[0];
    expect(event.imageUrl).toBe("");
    expect(event.imageAlt).toBe("Rock Fest");
  });

  it("returns a pending order without ticket rows with no tickets", () => {
    const [order] = toMyOrders([row({ orderStatus: "pending", ...noTicket })]);
    expect(order.status).toBe("pending");
    expect(order.tickets).toEqual([]);
  });

  it("returns nothing for no rows", () => {
    expect(toMyOrders([])).toEqual([]);
  });
});

const ticket = (id = "t1"): MyTicket => ({
  id,
  code: "A".repeat(22),
  zoneName: "Campo General",
  seatLabel: null,
  holderName: "Ana Perez",
  status: "valid",
});

const order = (overrides: Partial<MyOrder> = {}, event: Partial<MyOrder["event"]> = {}): MyOrder => ({
  id: "1",
  code: "TK-7H3KQ9XM",
  status: "paid",
  total: 90,
  currency: "PEN",
  buyerName: "Ana Perez",
  buyerEmail: "ana@example.com",
  event: {
    id: "event-1",
    slug: "rock-fest",
    title: "Rock Fest",
    category: "Música",
    imageUrl: "",
    imageAlt: "Rock Fest",
    date: "2026-10-01",
    startsAt: "20:00",
    venue: "Estadio Nacional",
    address: "Av. José Díaz s/n",
    city: "Lima",
    currency: "PEN",
    ...event,
  },
  tickets: [ticket()],
  ...overrides,
});

const at = (id: string, date: string, startsAt = "20:00") => order({ id }, { date, startsAt });

describe("splitOrdersByDate", () => {
  it("splits orders by event date and sorts each group", () => {
    const { upcoming, past } = splitOrdersByDate(
      [at("1", "2026-12-01"), at("2", "2026-10-01"), at("3", "2026-08-01"), at("4", "2026-09-01")],
      "2026-09-29",
    );
    expect(upcoming.map((item) => item.id)).toEqual(["2", "1"]);
    expect(past.map((item) => item.id)).toEqual(["4", "3"]);
  });

  it("counts an event happening today as upcoming", () => {
    const { upcoming, past } = splitOrdersByDate([at("1", "2026-09-29")], "2026-09-29");
    expect(upcoming).toHaveLength(1);
    expect(past).toHaveLength(0);
  });

  it("breaks ties on the same day by start time", () => {
    const { upcoming, past } = splitOrdersByDate(
      [at("1", "2026-10-01", "21:00"), at("2", "2026-10-01", "18:00"), at("3", "2026-08-01", "18:00"), at("4", "2026-08-01", "21:00")],
      "2026-09-29",
    );
    expect(upcoming.map((item) => item.id)).toEqual(["2", "1"]);
    expect(past.map((item) => item.id)).toEqual(["4", "3"]);
  });

  it("does not mutate the input", () => {
    const orders = [at("1", "2026-12-01"), at("2", "2026-10-01")];
    splitOrdersByDate(orders, "2026-09-29");
    expect(orders.map((item) => item.id)).toEqual(["1", "2"]);
  });
});

describe("getConfirmationView", () => {
  it("is not-found without an order", () => {
    expect(getConfirmationView(null, false)).toBe("not-found");
    expect(getConfirmationView(undefined, true)).toBe("not-found");
  });

  it("is processing while pending and timed-out once the polling gave up", () => {
    const pending = order({ status: "pending", tickets: [] });
    expect(getConfirmationView(pending, false)).toBe("processing");
    expect(getConfirmationView(pending, true)).toBe("timed-out");
  });

  it("is ready for a paid order with tickets, even after the polling gave up", () => {
    expect(getConfirmationView(order(), false)).toBe("ready");
    expect(getConfirmationView(order(), true)).toBe("ready");
  });

  it("treats a paid order without tickets as processing", () => {
    expect(getConfirmationView(order({ tickets: [] }), false)).toBe("processing");
    expect(getConfirmationView(order({ tickets: [] }), true)).toBe("timed-out");
  });

  it("is failed for cancelled and failed orders", () => {
    expect(getConfirmationView(order({ status: "cancelled", tickets: [] }), false)).toBe("failed");
    expect(getConfirmationView(order({ status: "failed", tickets: [] }), true)).toBe("failed");
  });

  it("is ready for refunded orders that have tickets", () => {
    expect(getConfirmationView(order({ status: "partially_refunded" }), false)).toBe("ready");
    expect(getConfirmationView(order({ status: "refunded" }), false)).toBe("ready");
  });
});

describe("getOrderPollInterval", () => {
  const pending = order({ status: "pending", tickets: [] });

  it("polls every 2 s while the order is pending and under the cap", () => {
    expect(ORDER_POLL_INTERVAL_MS).toBe(2000);
    expect(getOrderPollInterval(pending, 0)).toBe(2000);
    expect(getOrderPollInterval(pending, ORDER_POLL_MAX_POLLS - 1)).toBe(2000);
  });

  it("stops at the cap", () => {
    expect(ORDER_POLL_MAX_POLLS).toBe(30);
    expect(getOrderPollInterval(pending, ORDER_POLL_MAX_POLLS)).toBe(false);
    expect(getOrderPollInterval(pending, ORDER_POLL_MAX_POLLS + 5)).toBe(false);
  });

  it("stops once the order left pending", () => {
    expect(getOrderPollInterval(order(), 0)).toBe(false);
    expect(getOrderPollInterval(order({ status: "cancelled", tickets: [] }), 0)).toBe(false);
    expect(getOrderPollInterval(order({ status: "failed", tickets: [] }), 0)).toBe(false);
  });

  it("does not poll without an order", () => {
    expect(getOrderPollInterval(null, 0)).toBe(false);
    expect(getOrderPollInterval(undefined, 0)).toBe(false);
  });
});
