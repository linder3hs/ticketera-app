import type {
  PaymentGateway,
  PaymentIntentInput,
  PaymentIntentSnapshot,
  PreparedPayment,
} from "@/modules/payment/payment.types";
import { mapPaymentIntentStatus, toPaymentIntentParams } from "@/modules/payment/payment.utils";
import { findPaymentByOrderId, insertPayment } from "@/modules/payment/services/payment-record-service";
import { stripePaymentGateway } from "@/modules/payment/services/stripe-payment-gateway";

export type PreparePaymentInput = PaymentIntentInput;

function toPreparedPayment(intent: PaymentIntentSnapshot): PreparedPayment {
  const state = mapPaymentIntentStatus(intent.status);
  if (state === "closed") throw new Error(`PaymentIntent ${intent.id} is canceled.`);
  return state === "requires_payment" ? { state, clientSecret: intent.clientSecret } : { state };
}

/**
 * Creates (or resumes) the PaymentIntent of an order and its `payment` row. Idempotent per order:
 * the PaymentIntent is created with a key derived from the order, and an order with a `payment`
 * is never charged twice, it is read back instead. Provider and database errors propagate.
 */
export async function preparePayment(
  input: PreparePaymentInput,
  gateway: PaymentGateway = stripePaymentGateway,
): Promise<PreparedPayment> {
  const existing = await findPaymentByOrderId(input.orderId);
  if (existing) return toPreparedPayment(await gateway.retrievePaymentIntent(existing.stripePaymentIntentId));

  const created = await gateway.createPaymentIntent(toPaymentIntentParams(input), `payment-intent:${input.orderId}`);
  const inserted = await insertPayment({
    orderId: input.orderId,
    stripePaymentIntentId: created.id,
    amountCents: input.totalCents,
    applicationFeeCents: input.platformFeeCents,
    destinationAccountId: input.destinationAccountId,
  });
  if (inserted) return toPreparedPayment(created);

  // A concurrent request stored its payment first: use that one.
  const stored = await findPaymentByOrderId(input.orderId);
  if (!stored) throw new Error(`Payment of order ${input.orderId} could not be stored.`);
  const intent =
    stored.stripePaymentIntentId === created.id ? created : await gateway.retrievePaymentIntent(stored.stripePaymentIntentId);
  return toPreparedPayment(intent);
}
