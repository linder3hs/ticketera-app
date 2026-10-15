import { toLimaDate, toLimaTime } from "@/modules/event/event-list.utils";
import type { ConfirmationView, MyOrder, MyTicket, TicketStatus } from "@/modules/booking/order.types";
import type { OrderStatus } from "@/modules/payment/payment.types";

export const ORDER_MESSAGES = {
  invalid: "Datos inválidos.",
  generic: "No pudimos cargar tu compra. Intenta de nuevo.",
} as const;

/** How often the confirmation asks again while the webhook has not paid the order. */
export const ORDER_POLL_INTERVAL_MS = 2000;
/** Asks at most this many times (~60 s) before giving up. */
export const ORDER_POLL_MAX_POLLS = 30;

/**
 * One row of the orders read: an order with the event it is for and, when it has them, one of its
 * tickets. An order that has no tickets yet (`pending`) comes as a single row with every `ticket*`
 * column `null`.
 */
export interface OrderTicketRow {
  orderId: string;
  orderCode: string;
  orderStatus: OrderStatus;
  totalCents: number;
  buyerName: string;
  buyerEmail: string;
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  categoryLabel: string;
  coverImageUrl: string | null;
  coverAlt: string | null;
  startsAt: Date;
  currency: string;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  ticketId: string | null;
  ticketCode: string | null;
  ticketStatus: TicketStatus | null;
  holderName: string | null;
  zoneName: string | null;
  /** `venue_seat.row_label`; `null` in general admission. */
  seatRow: string | null;
  seatNumber: number | null;
}

function toMyTicket(row: OrderTicketRow): MyTicket | null {
  if (row.ticketId === null || row.ticketCode === null || row.ticketStatus === null) return null;
  if (row.holderName === null || row.zoneName === null) return null;
  return {
    id: row.ticketId,
    code: row.ticketCode,
    zoneName: row.zoneName,
    seatLabel: row.seatRow !== null && row.seatNumber !== null ? `Fila ${row.seatRow} · ${row.seatNumber}` : null,
    holderName: row.holderName,
    status: row.ticketStatus,
  };
}

function toMyOrder(row: OrderTicketRow): MyOrder {
  return {
    id: row.orderId,
    code: row.orderCode,
    status: row.orderStatus,
    total: row.totalCents / 100,
    currency: row.currency,
    buyerName: row.buyerName,
    buyerEmail: row.buyerEmail,
    event: {
      id: row.eventId,
      slug: row.eventSlug,
      title: row.eventTitle,
      category: row.categoryLabel,
      imageUrl: row.coverImageUrl ?? "",
      imageAlt: row.coverAlt ?? row.eventTitle,
      date: toLimaDate(row.startsAt),
      startsAt: toLimaTime(row.startsAt),
      venue: row.venueName,
      address: row.venueAddress,
      city: row.venueCity,
      currency: row.currency,
    },
    tickets: [],
  };
}

/** Groups the rows by order, keeping the order of the rows (and of the tickets within each order). */
export function toMyOrders(rows: OrderTicketRow[]): MyOrder[] {
  const byOrder = new Map<string, MyOrder>();
  for (const row of rows) {
    const order = byOrder.get(row.orderId) ?? toMyOrder(row);
    const ticket = toMyTicket(row);
    if (ticket) order.tickets.push(ticket);
    byOrder.set(row.orderId, order);
  }
  return [...byOrder.values()];
}

/**
 * Splits orders into upcoming (event today or later, soonest first) and past (most recent first).
 * `today` is a Lima calendar day, like `event.date`.
 */
export function splitOrdersByDate(orders: MyOrder[], today: string) {
  const byStart = (a: MyOrder, b: MyOrder) =>
    a.event.date.localeCompare(b.event.date) || a.event.startsAt.localeCompare(b.event.startsAt);

  return {
    upcoming: orders.filter((order) => order.event.date >= today).sort(byStart),
    past: orders.filter((order) => order.event.date < today).sort((a, b) => byStart(b, a)),
  };
}

/** Waiting for the webhook: still `pending`, or `paid` without its tickets (should not happen). */
function isProcessing(order: MyOrder): boolean {
  return order.status === "pending" || (order.status === "paid" && order.tickets.length === 0);
}

/** What the confirmation shows; `hasTimedOut` = the polling gave up while the order was still processing. */
export function getConfirmationView(order: MyOrder | null | undefined, hasTimedOut: boolean): ConfirmationView {
  if (!order) return "not-found";
  if (order.status === "cancelled" || order.status === "failed") return "failed";
  if (isProcessing(order)) return hasTimedOut ? "timed-out" : "processing";
  return "ready";
}

/** `refetchInterval` of the confirmation: keeps asking while the order is processing, up to the cap. */
export function getOrderPollInterval(order: MyOrder | null | undefined, polls: number): number | false {
  return order && isProcessing(order) && polls < ORDER_POLL_MAX_POLLS ? ORDER_POLL_INTERVAL_MS : false;
}
