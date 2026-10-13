import "server-only";

import Stripe from "stripe";

let client: Stripe | undefined;

/** Lazy Stripe client. The only place that reads `STRIPE_SECRET_KEY`; the API version is the SDK's own. */
export function getStripeClient(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
    client = new Stripe(key);
  }
  return client;
}
