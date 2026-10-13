import type { BuyerDocumentType } from "@/modules/booking/buyer.schema";
import type { PreparedPayment } from "@/modules/payment/payment.types";

/*
 * Wire contract of the checkout (Server Action ↔ client) and rows of its pure
 * mappings (`checkout.utils.ts`). Nothing here carries a `Date`.
 */

export type StartCheckoutResult =
  | { ok: true; data: { orderCode: string; payment: PreparedPayment } }
  | { ok: false; error: string };

/** Initial values of the buyer form; empty strings when the user has no data yet. */
export interface BuyerDefaults {
  fullName: string;
  email: string;
  documentType: BuyerDocumentType;
  documentNumber: string;
  phone: string;
}

/** The fields of a `user` that prefill the buyer form. */
export interface BuyerProfile {
  fullName: string | null;
  email: string;
  phone: string | null;
  documentType: BuyerDocumentType | null;
  documentNumber: string | null;
}

/**
 * A reservation item priced for the order: a seat (`quantity` 1, `eventSeatId`
 * set) or a GA zone (`eventSeatId` null, `quantity` tickets).
 */
export interface OrderItemSource {
  eventZoneId: string;
  eventSeatId: string | null;
  quantity: number;
  /** `event_zone.price_cents` of the zone. */
  priceCents: number;
}

/** One `order_item` to insert: one per ticket. */
export interface NewOrderItem {
  orderId: string;
  eventZoneId: string;
  eventSeatId: string | null;
  unitPriceCents: number;
}

/** Amounts of an order, in minor units. The buyer pays `totalCents`; the fee is taken from the organizer. */
export interface OrderAmounts {
  subtotalCents: number;
  platformFeeCents: number;
  totalCents: number;
}
