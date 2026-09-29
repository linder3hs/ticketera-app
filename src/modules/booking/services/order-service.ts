import type { Order } from "@/modules/booking/booking.types";

/**
 * Sample orders shown in "Mis entradas" next to the ones paid in this
 * browser, so the screen isn't empty on a first visit.
 */
const MOCK_ORDERS: Order[] = [
  {
    id: "TK-24817",
    eventId: "evt-001",
    lines: [{ zoneId: "general", zoneName: "Campo General", quantity: 2, amount: 900, seats: [] }],
    count: 2,
    total: 900,
    currency: "PEN",
    method: "card",
    buyerName: "",
    email: "",
  },
  {
    id: "TK-24790",
    eventId: "evt-004",
    lines: [
      {
        zoneId: "platea",
        zoneName: "Platea",
        quantity: 1,
        amount: 60,
        seats: [{ id: "platea-F12", row: "F", number: 12, x: 0, y: 0, status: "available" }],
      },
    ],
    count: 1,
    total: 60,
    currency: "PEN",
    method: "yape",
    buyerName: "",
    email: "",
  },
];

/** Sample orders of the signed-in user (mock). */
export async function getMyOrders(): Promise<Order[]> {
  return MOCK_ORDERS;
}

/**
 * Splits orders into upcoming (event today or later, soonest first) and past
 * (most recent first). Orders of unknown events are dropped.
 */
export function splitOrdersByDate(orders: Order[], eventDates: Record<string, string>, today: string) {
  const known = orders.filter((order) => eventDates[order.eventId]);
  const date = (order: Order) => eventDates[order.eventId];

  return {
    upcoming: known.filter((order) => date(order) >= today).sort((a, b) => date(a).localeCompare(date(b))),
    past: known.filter((order) => date(order) < today).sort((a, b) => date(b).localeCompare(date(a))),
  };
}
