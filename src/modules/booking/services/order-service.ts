import type { MyOrder } from "@/modules/booking/order.types";
import { toMyOrders } from "@/modules/booking/order.utils";
import { findOrderRow, findTicketRows, listTicketRows } from "@/modules/booking/services/order-data-service";

/** The orders with tickets of `userId`, newest paid first. Always scoped to that user. */
export async function listMyOrders(userId: string): Promise<MyOrder[]> {
  return toMyOrders(await listTicketRows(userId));
}

/**
 * The order of `userId` with that code (`tickets: []` while it is still `pending`), or `null`.
 * Someone else's order is indistinguishable from one that doesn't exist.
 */
export async function findMyOrder(userId: string, code: string): Promise<MyOrder | null> {
  const ticketRows = await findTicketRows(userId, code);
  if (ticketRows.length > 0) return toMyOrders(ticketRows)[0];

  const orderRow = await findOrderRow(userId, code);
  return orderRow ? toMyOrders([orderRow])[0] : null;
}
