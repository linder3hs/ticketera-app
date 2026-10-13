import { WebhookSignatureError, type ConnectGateway } from "@/modules/payment/payment.types";
import { CONNECT_EVENT_TYPES } from "@/modules/payment/payment.utils";
import { syncConnectStatus } from "@/modules/payment/services/connect-service";
import { stripeConnectGateway } from "@/modules/payment/services/stripe-connect-gateway";
import {
  hasProcessedStripeEvent,
  markStripeEventProcessed,
} from "@/modules/payment/services/stripe-event-service";

export interface ConnectWebhookResult {
  status: 200 | 400 | 500;
}

/**
 * Verifies and handles a Connect (thin) webhook: invalid signature -> 400, ignored or already
 * handled event -> 200, failure while syncing -> 500 (the provider retries; nothing is recorded).
 */
export async function handleConnectWebhook(
  payload: string,
  signature: string | null,
  gateway: ConnectGateway = stripeConnectGateway,
): Promise<ConnectWebhookResult> {
  if (!signature) return { status: 400 };

  try {
    const event = gateway.parseWebhook(payload, signature);
    if (!CONNECT_EVENT_TYPES.includes(event.type) || !event.accountId) return { status: 200 };
    if (await hasProcessedStripeEvent(event.id)) return { status: 200 };

    await syncConnectStatus(event.accountId, gateway);
    // Recorded after the sync: a failure above leaves it unrecorded so the retry runs again.
    await markStripeEventProcessed(event.id, event.type);
    return { status: 200 };
  } catch (error) {
    if (error instanceof WebhookSignatureError) return { status: 400 };
    console.error("[connect] webhook failed", error instanceof Error ? error.message : "unknown error");
    return { status: 500 };
  }
}
