import Stripe from "stripe";

import {
  WebhookSignatureError,
  type ConnectGateway,
  type TransfersStatus,
} from "@/modules/payment/payment.types";
import { getStripeClient } from "@/modules/payment/services/stripe-client";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

/** Public base URL for the return/refresh links of the hosted onboarding. */
function appUrl(): string {
  const url = process.env.APP_URL ?? (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000");
  if (!url) throw new Error("APP_URL is not set.");
  return url;
}

/** Id of the account an event is about; singleton related objects carry none. */
function relatedAccountId(notification: object): string | null {
  const related = (notification as { related_object?: { id?: string } | null }).related_object;
  return related?.id ?? null;
}

/** `ConnectGateway` on Stripe Accounts v2 (recipient configuration, Stripe-hosted onboarding). */
export const stripeConnectGateway: ConnectGateway = {
  async createAccount({ businessName, contactEmail, organizerId, idempotencyKey }) {
    const country = requireEnv("STRIPE_CONNECT_ACCOUNT_COUNTRY");
    const currency = requireEnv("STRIPE_CONNECT_ACCOUNT_CURRENCY");
    const account = await getStripeClient().v2.core.accounts.create(
      {
        display_name: businessName,
        contact_email: contactEmail,
        dashboard: "express",
        identity: { country, entity_type: "company" },
        defaults: {
          currency,
          responsibilities: { fees_collector: "application", losses_collector: "application" },
        },
        configuration: {
          recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } },
        },
        metadata: { organizer_id: organizerId },
        include: ["configuration.recipient", "requirements"],
      },
      { idempotencyKey },
    );
    return { accountId: account.id };
  },

  async createOnboardingLink(accountId) {
    const base = appUrl();
    const link = await getStripeClient().v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          refresh_url: new URL("/organizer/settings/connect/refresh", base).toString(),
          return_url: new URL("/organizer/settings?connect=return", base).toString(),
        },
      },
    });
    return { url: link.url };
  },

  async getTransfersStatus(accountId): Promise<TransfersStatus | null> {
    const account = await getStripeClient().v2.core.accounts.retrieve(accountId, {
      include: ["configuration.recipient", "requirements"],
    });
    return account.configuration?.recipient?.capabilities?.stripe_balance?.stripe_transfers?.status ?? null;
  },

  parseWebhook(payload, signature) {
    const secret = requireEnv("STRIPE_CONNECT_WEBHOOK_SECRET");
    try {
      const notification = getStripeClient().parseEventNotification(payload, signature, secret);
      return {
        id: notification.id,
        type: notification.type,
        accountId: relatedAccountId(notification),
      };
    } catch (error) {
      if (error instanceof Stripe.errors.StripeSignatureVerificationError) throw new WebhookSignatureError();
      throw error;
    }
  },
};
