// Server code (node:crypto). Not guarded against client imports: the guard package throws under Vitest.
import { randomBytes as cryptoRandomBytes } from "node:crypto";

const TICKET_CODE_BYTES = 16;

/** Opaque QR token: 16 random bytes (128 bits) in base64url, 22 characters of `[A-Za-z0-9_-]`. */
export function generateTicketCode(randomBytes: (size: number) => Buffer = cryptoRandomBytes): string {
  return randomBytes(TICKET_CODE_BYTES).toString("base64url");
}

/** A `ticket` row to insert: one per `order_item`, held by the buyer. */
export interface NewTicket {
  orderItemId: string;
  eventId: string;
  holderName: string;
  code: string;
}

/** One ticket per `order_item` id, in the same order, each with its own code. */
export function toNewTickets(
  orderItemIds: readonly string[],
  eventId: string,
  holderName: string,
  generateCode: () => string = generateTicketCode,
): NewTicket[] {
  return orderItemIds.map((orderItemId) => ({ orderItemId, eventId, holderName, code: generateCode() }));
}
