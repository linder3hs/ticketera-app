import type { refundReason, ticketStatus } from "@/db/schema/enums"; // solo tipo, como payment.types.ts
import type { OrderStatus, RefundStatus } from "@/modules/payment/payment.types";

export type TicketStatus = (typeof ticketStatus.enumValues)[number];
export type RefundReason = (typeof refundReason.enumValues)[number];

export interface MyTicket {
  id: string;
  /** Token del QR: `ticket.code` crudo. */
  code: string;
  zoneName: string;
  /** Solo zonas numeradas, p. ej. "Fila A · 4"; null en GA. */
  seatLabel: string | null;
  holderName: string;
  status: TicketStatus;
}

/** Evento de la orden: forma compatible con `ExportEvent` + portada. */
export interface MyOrderEvent {
  id: string;
  slug: string;
  title: string;
  category: string;
  /** "" = sin portada (usar `EventCover`). */
  imageUrl: string;
  imageAlt: string;
  /** "YYYY-MM-DD" y "HH:mm" en Lima. */
  date: string;
  startsAt: string;
  venue: string;
  address: string;
  city: string;
  currency: string;
}

/** Último reembolso de la orden: lo que el comprador ve en "Mis entradas". */
export interface MyOrderRefund {
  status: RefundStatus;
  reason: RefundReason;
  /** Unidades de moneda (`amount_cents / 100`). */
  amount: number;
}

export interface MyOrder {
  id: string;
  /** "TK-" + 8; lo que ve el comprador como "Pedido N.º". */
  code: string;
  status: OrderStatus;
  /** Unidades de moneda (`total_cents / 100`), como el resto de la UI. */
  total: number;
  currency: string;
  buyerName: string;
  buyerEmail: string;
  event: MyOrderEvent;
  /** Su último reembolso; `null` si no tiene. */
  refund: MyOrderRefund | null;
  /** Vacío mientras la orden está `pending`. */
  tickets: MyTicket[];
}

export type MyOrderResult = { ok: true; data: MyOrder | null } | { ok: false; error: string };

/** Qué muestra la confirmación. */
export type ConfirmationView = "not-found" | "processing" | "timed-out" | "ready" | "failed";
