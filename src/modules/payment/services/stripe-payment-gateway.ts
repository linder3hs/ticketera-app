import type { PaymentGateway, PaymentIntentSnapshot } from "@/modules/payment/payment.types";
import { getStripeClient } from "@/modules/payment/services/stripe-client";

/** The SDK types `client_secret` as nullable; every PaymentIntent we create or read has one. */
function toSnapshot(intent: { id: string; client_secret: string | null; status: string }): PaymentIntentSnapshot {
  if (!intent.client_secret) throw new Error(`PaymentIntent ${intent.id} has no client secret.`);
  return { id: intent.id, clientSecret: intent.client_secret, status: intent.status };
}

/** `PaymentGateway` on Stripe PaymentIntents (destination charges). */
export const stripePaymentGateway: PaymentGateway = {
  async createPaymentIntent(params, idempotencyKey) {
    return toSnapshot(await getStripeClient().paymentIntents.create(params, { idempotencyKey }));
  },

  async retrievePaymentIntent(id) {
    return toSnapshot(await getStripeClient().paymentIntents.retrieve(id));
  },
};
