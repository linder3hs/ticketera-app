import Stripe from "stripe";

import {
  WebhookSignatureError,
  type PaymentGateway,
  type PaymentIntentSnapshot,
  type PaymentWebhookEvent,
  type PaymentWebhookGateway,
} from "@/modules/payment/payment.types";
import { getStripeClient } from "@/modules/payment/services/stripe-client";

/** The SDK types `client_secret` as nullable; every PaymentIntent we create or read has one. */
function toSnapshot(intent: { id: string; client_secret: string | null; status: string }): PaymentIntentSnapshot {
  if (!intent.client_secret) throw new Error(`PaymentIntent ${intent.id} has no client secret.`);
  return { id: intent.id, clientSecret: intent.client_secret, status: intent.status };
}

/** The verified event, narrowed to its PaymentIntent and latest charge, or to its refund (ids are null for any other object). */
function toWebhookEvent(event: Stripe.Event): PaymentWebhookEvent {
  const object = event.data.object;
  if (object.object === "refund") {
    return {
      id: event.id,
      type: event.type,
      paymentIntentId: null,
      chargeId: null,
      refund: { id: object.id, status: object.status ?? "", metadataRefundId: object.metadata?.refund_id ?? null },
    };
  }
  if (object.object !== "payment_intent") {
    return { id: event.id, type: event.type, paymentIntentId: null, chargeId: null };
  }
  const charge = object.latest_charge;
  return {
    id: event.id,
    type: event.type,
    paymentIntentId: object.id,
    chargeId: typeof charge === "string" ? charge : (charge?.id ?? null),
  };
}

/** `PaymentGateway` on Stripe PaymentIntents (destination charges), plus the payments webhook port. */
export const stripePaymentGateway: PaymentGateway & PaymentWebhookGateway = {
  async createPaymentIntent(params, idempotencyKey) {
    return toSnapshot(await getStripeClient().paymentIntents.create(params, { idempotencyKey }));
  },

  async retrievePaymentIntent(id) {
    return toSnapshot(await getStripeClient().paymentIntents.retrieve(id));
  },

  parseWebhook(payload, signature) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
    try {
      return toWebhookEvent(getStripeClient().webhooks.constructEvent(payload, signature, secret));
    } catch (error) {
      if (error instanceof Stripe.errors.StripeSignatureVerificationError) throw new WebhookSignatureError();
      throw error;
    }
  },

  async refundPayment(paymentIntentId, idempotencyKey, options) {
    try {
      const refund = await getStripeClient().refunds.create(
        {
          payment_intent: paymentIntentId,
          reverse_transfer: true,
          refund_application_fee: true,
          ...(options?.metadata ? { metadata: options.metadata } : {}),
        },
        { idempotencyKey },
      );
      return { refundId: refund.id };
    } catch (error) {
      // A retry after the key's 24 h window: the charge was already refunded by the first attempt.
      if (error instanceof Stripe.errors.StripeError && error.code === "charge_already_refunded") {
        return { refundId: null };
      }
      throw error;
    }
  },
};
