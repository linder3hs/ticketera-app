import { randomInt as cryptoRandomInt } from "node:crypto";

import type { BuyerDefaults, BuyerProfile, NewOrderItem, OrderAmounts, OrderItemSource } from "@/modules/booking/checkout.types";
import { calculatePlatformFeeCents } from "@/modules/payment/payment.utils";

export const CHECKOUT_MESSAGES = {
  invalid: "Datos inválidos.",
  eventUnavailable: "Este evento ya no está disponible.",
  reservationExpired: "Tu reserva expiró. Elige tus entradas de nuevo.",
  orderClosed: "Este pedido ya no admite pagos. Elige tus entradas de nuevo.",
  payoutsUnavailable: "Este organizador aún no puede recibir pagos. Intenta más tarde.",
  nothingToPay: "No hay nada que pagar en esta reserva.",
  generic: "No pudimos iniciar tu pago. Intenta de nuevo.",
} as const;

/** Crockford base32: digits and letters without I, L, O and U. */
export const ORDER_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ORDER_CODE_LENGTH = 8;

/** `TK-` + 8 random characters (e.g. `TK-7H3KQ9XM`). `randomInt(max)` returns an integer in `[0, max)`. */
export function generateOrderCode(randomInt: (max: number) => number = cryptoRandomInt): string {
  let suffix = "";
  for (let i = 0; i < ORDER_CODE_LENGTH; i += 1) {
    suffix += ORDER_CODE_ALPHABET[randomInt(ORDER_CODE_ALPHABET.length)];
  }
  return `TK-${suffix}`;
}

/** `order_item` rows: one per ticket, so a GA item of `quantity` n becomes n rows. */
export function toOrderItems(orderId: string, items: OrderItemSource[]): NewOrderItem[] {
  return items.flatMap((item) =>
    Array.from({ length: item.quantity }, () => ({
      orderId,
      eventZoneId: item.eventZoneId,
      eventSeatId: item.eventSeatId,
      unitPriceCents: item.priceCents,
    })),
  );
}

/** Order amounts from the priced items: the buyer pays the subtotal and the platform fee comes out of it. */
export function calculateOrderAmounts(items: OrderItemSource[], feePercent: number): OrderAmounts {
  const subtotalCents = items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);
  return {
    subtotalCents,
    platformFeeCents: calculatePlatformFeeCents(subtotalCents, feePercent),
    totalCents: subtotalCents,
  };
}

/** Initial values of the buyer form from the signed-in user. */
export function toBuyerDefaults(user: BuyerProfile): BuyerDefaults {
  return {
    fullName: user.fullName ?? "",
    email: user.email,
    documentType: user.documentType ?? "dni",
    documentNumber: user.documentNumber ?? "",
    phone: user.phone ?? "",
  };
}
