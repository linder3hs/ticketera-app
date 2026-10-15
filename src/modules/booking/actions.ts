"use server";

import { pgErrorCode } from "@/lib/pg-error";
import { startCheckoutSchema } from "@/modules/booking/buyer.schema";
import type { StartCheckoutResult } from "@/modules/booking/checkout.types";
import { CHECKOUT_MESSAGES } from "@/modules/booking/checkout.utils";
import { getMyOrderSchema } from "@/modules/booking/order.schema";
import type { MyOrderResult } from "@/modules/booking/order.types";
import { ORDER_MESSAGES } from "@/modules/booking/order.utils";
import { reserveTicketsSchema } from "@/modules/booking/reservation.schema";
import type { ReserveTicketsResult } from "@/modules/booking/reservation.types";
import { RESERVATION_MESSAGES } from "@/modules/booking/reservation.utils";
import { startCheckout } from "@/modules/booking/services/checkout-service";
import { findMyOrder } from "@/modules/booking/services/order-service";
import { reserveTickets } from "@/modules/booking/services/reservation-service";
import { getPublicEventDetail } from "@/modules/event/services/event-public-service";
import { requireRole } from "@/modules/user/current-user";

/**
 * Holds the selection for the signed-in customer (signed out → sign-in, back
 * to the calling page). The event must be visible in public; the hold itself
 * is the service's. Failures are logged and answered with a generic message.
 * No revalidation: every page that shows availability renders per request.
 */
export async function reserveTicketsAction(input: unknown): Promise<ReserveTicketsResult> {
  const user = await requireRole("customer");
  const parsed = reserveTicketsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: RESERVATION_MESSAGES.invalid };

  const { slug, seats, generalAdmission } = parsed.data;
  try {
    const event = await getPublicEventDetail(slug);
    if (!event) return { ok: false, error: RESERVATION_MESSAGES.eventUnavailable };
    return await reserveTickets(user.id, event.id, { seats, generalAdmission });
  } catch (error) {
    console.error("reserveTicketsAction", error);
    return { ok: false, error: RESERVATION_MESSAGES.generic };
  }
}

/**
 * Only what is safe to log: a driver error's message carries the failed query with its
 * parameters (the buyer's data), so for those the underlying error is logged instead.
 */
function toLoggableError(error: unknown) {
  const root =
    error instanceof Error && error.cause instanceof Error && error.message.startsWith("Failed query")
      ? error.cause
      : error;
  return root instanceof Error
    ? { name: root.name, code: pgErrorCode(root), message: root.message }
    : { name: typeof root };
}

/**
 * Creates (or resumes) the payment of the signed-in customer's live reservation for the event.
 * The client sends only the slug and the buyer: the reservation comes from the session and every
 * amount from the DB. Signed out → sign-in. Failures are logged without personal data and
 * answered with a generic message.
 */
export async function startCheckoutAction(input: unknown): Promise<StartCheckoutResult> {
  const user = await requireRole("customer");
  const parsed = startCheckoutSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: CHECKOUT_MESSAGES.invalid };

  const { slug, fullName, email, documentType, documentNumber, phone } = parsed.data;
  try {
    const event = await getPublicEventDetail(slug);
    if (!event) return { ok: false, error: CHECKOUT_MESSAGES.eventUnavailable };
    return await startCheckout({
      userId: user.id,
      eventId: event.id,
      currency: event.currency,
      buyer: { fullName, email, documentType, documentNumber, phone },
    });
  } catch (error) {
    console.error("startCheckoutAction", toLoggableError(error));
    return { ok: false, error: CHECKOUT_MESSAGES.generic };
  }
}

/**
 * The signed-in customer's order with that code, or `null` if it doesn't exist or isn't theirs
 * (indistinguishable on purpose). The client sends only the code; the owner comes from the session.
 * Signed out → sign-in. Failures are logged without personal data and answered with a generic message.
 */
export async function getMyOrderAction(input: unknown): Promise<MyOrderResult> {
  const user = await requireRole("customer");
  const parsed = getMyOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: ORDER_MESSAGES.invalid };

  try {
    return { ok: true, data: await findMyOrder(user.id, parsed.data.code) };
  } catch (error) {
    console.error("getMyOrderAction", toLoggableError(error));
    return { ok: false, error: ORDER_MESSAGES.generic };
  }
}
