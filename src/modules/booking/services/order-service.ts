import type { MyOrder } from "@/modules/booking/order.types";
import { toMyOrders, type OrderTicketRow } from "@/modules/booking/order.utils";
import {
  findOrderRow,
  findOrderRowById,
  findTicketRows,
  findTicketRowsByOrderId,
  listTicketRows,
} from "@/modules/booking/services/order-data-service";

/** The orders with tickets of `userId`, newest paid first. Always scoped to that user. */
export async function listMyOrders(userId: string): Promise<MyOrder[]> {
  return toMyOrders(await listTicketRows(userId));
}

/**
 * The order of `userId` with that code (`tickets: []` while it is still `pending`), or `null`.
 * Someone else's order is indistinguishable from one that doesn't exist.
 */
export function findMyOrder(userId: string, code: string): Promise<MyOrder | null> {
  return findOrder(() => findTicketRows(userId, code), () => findOrderRow(userId, code));
}

/** Server-side only, NOT scoped to a user: the order by id with its tickets (for buyer emails), or `null`. */
export function findOrderById(orderId: string): Promise<MyOrder | null> {
  return findOrder(() => findTicketRowsByOrderId(orderId), () => findOrderRowById(orderId));
}

/** The order from its ticket rows, or from the bare order row when it has no tickets yet. */
async function findOrder(
  ticketRows: () => Promise<OrderTicketRow[]>,
  orderRow: () => Promise<OrderTicketRow | null>,
): Promise<MyOrder | null> {
  const rows = await ticketRows();
  if (rows.length > 0) return toMyOrders(rows)[0];

  const row = await orderRow();
  return row ? toMyOrders([row])[0] : null;
}
