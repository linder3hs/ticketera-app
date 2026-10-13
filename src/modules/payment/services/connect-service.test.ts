import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ConnectGateway } from "@/modules/payment/payment.types";
import {
  refreshConnectStatus,
  startConnectOnboarding,
  syncConnectStatus,
} from "@/modules/payment/services/connect-service";
import {
  findOrganizerByUserId,
  setStripeAccountId,
  setStripeOnboardingStatus,
} from "@/modules/user/services/user-service";

vi.mock("@/modules/user/services/user-service", () => ({
  findOrganizerByUserId: vi.fn(),
  setStripeAccountId: vi.fn(),
  setStripeOnboardingStatus: vi.fn(),
}));
// The real gateway pulls in the Stripe SDK; tests inject a fake instead.
vi.mock("@/modules/payment/services/stripe-connect-gateway", () => ({ stripeConnectGateway: {} }));

const GENERIC = "No pudimos iniciar la configuración de pagos. Intenta de nuevo.";
const user = { id: "user-1", email: "org@example.com" };

const organizer = {
  id: "org-1",
  status: "approved" as const,
  businessName: "Acme SAC",
  taxId: "20131312955",
  stripeAccountId: null as string | null,
  stripeOnboardingStatus: "not_started" as "not_started" | "pending" | "complete",
};

const gateway = {
  createAccount: vi.fn(),
  createOnboardingLink: vi.fn(),
  getTransfersStatus: vi.fn(),
  parseWebhook: vi.fn(),
} satisfies ConnectGateway;

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  gateway.createAccount.mockResolvedValue({ accountId: "acct_new" });
  gateway.createOnboardingLink.mockResolvedValue({ url: "https://connect.stripe.test/link" });
  vi.mocked(findOrganizerByUserId).mockResolvedValue({ ...organizer });
  vi.mocked(setStripeAccountId).mockImplementation(async (_id, accountId) => accountId);
});

describe("startConnectOnboarding", () => {
  it("creates one account, stores it and returns the onboarding link", async () => {
    const result = await startConnectOnboarding(user, gateway);

    expect(result).toEqual({ ok: true, url: "https://connect.stripe.test/link" });
    expect(gateway.createAccount).toHaveBeenCalledTimes(1);
    expect(gateway.createAccount).toHaveBeenCalledWith({
      businessName: "Acme SAC",
      contactEmail: "org@example.com",
      organizerId: "org-1",
      idempotencyKey: "connect-account:org-1",
    });
    expect(setStripeAccountId).toHaveBeenCalledWith("org-1", "acct_new");
    expect(gateway.createOnboardingLink).toHaveBeenCalledWith("acct_new");
  });

  it("reuses the existing account and only issues a new link", async () => {
    vi.mocked(findOrganizerByUserId).mockResolvedValue({
      ...organizer,
      stripeAccountId: "acct_old",
      stripeOnboardingStatus: "pending",
    });

    const result = await startConnectOnboarding(user, gateway);

    expect(result).toEqual({ ok: true, url: "https://connect.stripe.test/link" });
    expect(gateway.createAccount).not.toHaveBeenCalled();
    expect(setStripeAccountId).not.toHaveBeenCalled();
    expect(gateway.createOnboardingLink).toHaveBeenCalledWith("acct_old");
  });

  it("uses the winning account when a concurrent request linked one first", async () => {
    vi.mocked(setStripeAccountId).mockResolvedValue("acct_winner");

    await startConnectOnboarding(user, gateway);

    expect(gateway.createOnboardingLink).toHaveBeenCalledWith("acct_winner");
  });

  it("does not call the provider when onboarding is already complete", async () => {
    vi.mocked(findOrganizerByUserId).mockResolvedValue({
      ...organizer,
      stripeAccountId: "acct_old",
      stripeOnboardingStatus: "complete",
    });

    const result = await startConnectOnboarding(user, gateway);

    expect(result).toEqual({ ok: false, error: "Tu cuenta de pagos ya está configurada." });
    expect(gateway.createAccount).not.toHaveBeenCalled();
    expect(gateway.createOnboardingLink).not.toHaveBeenCalled();
  });

  it("fails without a saved tax id", async () => {
    vi.mocked(findOrganizerByUserId).mockResolvedValue({ ...organizer, taxId: null });

    const result = await startConnectOnboarding(user, gateway);

    expect(result.ok).toBe(false);
    expect(gateway.createAccount).not.toHaveBeenCalled();
  });

  it("fails when the user has no organizer row", async () => {
    vi.mocked(findOrganizerByUserId).mockResolvedValue(undefined);

    const result = await startConnectOnboarding(user, gateway);

    expect(result).toEqual({ ok: false, error: "No encontramos tu perfil de organizador." });
    expect(gateway.createAccount).not.toHaveBeenCalled();
  });

  it("hides provider errors behind a generic message and logs without the tax id", async () => {
    gateway.createAccount.mockRejectedValue(new Error("STRIPE_CONNECT_ACCOUNT_COUNTRY is not set."));

    const result = await startConnectOnboarding(user, gateway);

    expect(result).toEqual({ ok: false, error: GENERIC });
    expect(console.error).toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(organizer.taxId);
  });

  it("hides link errors behind the generic message", async () => {
    gateway.createOnboardingLink.mockRejectedValue(new Error("stripe down"));

    expect(await startConnectOnboarding(user, gateway)).toEqual({ ok: false, error: GENERIC });
  });
});

describe("syncConnectStatus", () => {
  it("stores complete for an active transfers capability", async () => {
    gateway.getTransfersStatus.mockResolvedValue("active");
    vi.mocked(setStripeOnboardingStatus).mockResolvedValue(true);

    expect(await syncConnectStatus("acct_1", gateway)).toBe("complete");
    expect(setStripeOnboardingStatus).toHaveBeenCalledWith("acct_1", "complete");
  });

  it("drops back to pending when the capability is restricted", async () => {
    gateway.getTransfersStatus.mockResolvedValue("restricted");
    vi.mocked(setStripeOnboardingStatus).mockResolvedValue(true);

    expect(await syncConnectStatus("acct_1", gateway)).toBe("pending");
    expect(setStripeOnboardingStatus).toHaveBeenCalledWith("acct_1", "pending");
  });

  it("logs rejected accounts by id only", async () => {
    gateway.getTransfersStatus.mockResolvedValue("rejected");
    vi.mocked(setStripeOnboardingStatus).mockResolvedValue(true);

    await syncConnectStatus("acct_1", gateway);

    expect(console.error).toHaveBeenCalledWith("[connect] account rejected", { accountId: "acct_1" });
  });

  it("returns null for an unknown account", async () => {
    gateway.getTransfersStatus.mockResolvedValue("active");
    vi.mocked(setStripeOnboardingStatus).mockResolvedValue(false);

    expect(await syncConnectStatus("acct_x", gateway)).toBeNull();
  });
});

describe("refreshConnectStatus", () => {
  it("syncs the account of the organizer", async () => {
    vi.mocked(findOrganizerByUserId).mockResolvedValue({ ...organizer, stripeAccountId: "acct_1" });
    gateway.getTransfersStatus.mockResolvedValue("active");
    vi.mocked(setStripeOnboardingStatus).mockResolvedValue(true);

    expect(await refreshConnectStatus(user, gateway)).toBe("complete");
    expect(gateway.getTransfersStatus).toHaveBeenCalledWith("acct_1");
  });

  it("does nothing without a linked account", async () => {
    expect(await refreshConnectStatus(user, gateway)).toBeNull();
    expect(gateway.getTransfersStatus).not.toHaveBeenCalled();
  });
});
