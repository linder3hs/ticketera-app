import { beforeEach, describe, expect, it, vi } from "vitest";

import { WebhookSignatureError, type ConnectGateway } from "@/modules/payment/payment.types";
import { syncConnectStatus } from "@/modules/payment/services/connect-service";
import { handleConnectWebhook } from "@/modules/payment/services/connect-webhook-service";
import {
  hasProcessedStripeEvent,
  markStripeEventProcessed,
} from "@/modules/payment/services/stripe-event-service";

vi.mock("@/modules/payment/services/connect-service", () => ({ syncConnectStatus: vi.fn() }));
vi.mock("@/modules/payment/services/stripe-event-service", () => ({
  hasProcessedStripeEvent: vi.fn(),
  markStripeEventProcessed: vi.fn(),
}));
// The real gateway pulls in the Stripe SDK; tests inject a fake instead.
vi.mock("@/modules/payment/services/stripe-connect-gateway", () => ({ stripeConnectGateway: {} }));

const RELEVANT = "v2.core.account[configuration.recipient].capability_status_updated";

const gateway = {
  createAccount: vi.fn(),
  createOnboardingLink: vi.fn(),
  getTransfersStatus: vi.fn(),
  parseWebhook: vi.fn(),
} satisfies ConnectGateway;

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  gateway.parseWebhook.mockReturnValue({ id: "evt_1", type: RELEVANT, accountId: "acct_1" });
  vi.mocked(hasProcessedStripeEvent).mockResolvedValue(false);
  vi.mocked(syncConnectStatus).mockResolvedValue("complete");
});

describe("handleConnectWebhook", () => {
  it("returns 400 without touching the DB when the signature is missing", async () => {
    expect(await handleConnectWebhook("{}", null, gateway)).toEqual({ status: 400 });
    expect(gateway.parseWebhook).not.toHaveBeenCalled();
    expect(hasProcessedStripeEvent).not.toHaveBeenCalled();
  });

  it("returns 400 without touching the DB when the signature is invalid", async () => {
    gateway.parseWebhook.mockImplementation(() => {
      throw new WebhookSignatureError();
    });

    expect(await handleConnectWebhook("{}", "bad", gateway)).toEqual({ status: 400 });
    expect(hasProcessedStripeEvent).not.toHaveBeenCalled();
    expect(syncConnectStatus).not.toHaveBeenCalled();
    expect(markStripeEventProcessed).not.toHaveBeenCalled();
  });

  it("ignores irrelevant event types", async () => {
    gateway.parseWebhook.mockReturnValue({ id: "evt_2", type: "v2.core.account.created", accountId: "acct_1" });

    expect(await handleConnectWebhook("{}", "sig", gateway)).toEqual({ status: 200 });
    expect(syncConnectStatus).not.toHaveBeenCalled();
    expect(markStripeEventProcessed).not.toHaveBeenCalled();
  });

  it("does not repeat work for an event already processed", async () => {
    vi.mocked(hasProcessedStripeEvent).mockResolvedValue(true);

    expect(await handleConnectWebhook("{}", "sig", gateway)).toEqual({ status: 200 });
    expect(syncConnectStatus).not.toHaveBeenCalled();
  });

  it("syncs a relevant event and records it after the sync", async () => {
    const order: string[] = [];
    vi.mocked(syncConnectStatus).mockImplementation(async () => {
      order.push("sync");
      return "complete";
    });
    vi.mocked(markStripeEventProcessed).mockImplementation(async () => {
      order.push("mark");
    });

    expect(await handleConnectWebhook("{}", "sig", gateway)).toEqual({ status: 200 });
    expect(syncConnectStatus).toHaveBeenCalledWith("acct_1", gateway);
    expect(markStripeEventProcessed).toHaveBeenCalledWith("evt_1", RELEVANT);
    expect(order).toEqual(["sync", "mark"]);
  });

  it("returns 500 and records nothing when the sync fails", async () => {
    vi.mocked(syncConnectStatus).mockRejectedValue(new Error("stripe down"));

    expect(await handleConnectWebhook("{}", "sig", gateway)).toEqual({ status: 500 });
    expect(markStripeEventProcessed).not.toHaveBeenCalled();
  });

  it("returns 200 for an unknown account", async () => {
    vi.mocked(syncConnectStatus).mockResolvedValue(null);

    expect(await handleConnectWebhook("{}", "sig", gateway)).toEqual({ status: 200 });
  });

  it("returns 500 on a configuration error from the gateway", async () => {
    gateway.parseWebhook.mockImplementation(() => {
      throw new Error("STRIPE_CONNECT_WEBHOOK_SECRET is not set.");
    });

    expect(await handleConnectWebhook("{}", "sig", gateway)).toEqual({ status: 500 });
  });
});
