import { notifyConnectStatus } from "@/modules/email/services/notification-service";
import type { ConnectGateway, ConnectLinkResult } from "@/modules/payment/payment.types";
import { mapTransfersStatus } from "@/modules/payment/payment.utils";
import { stripeConnectGateway } from "@/modules/payment/services/stripe-connect-gateway";
import {
  findOrganizerByUserId,
  findStripeAccountOwner,
  setStripeAccountId,
  setStripeOnboardingStatus,
} from "@/modules/user/services/user-service";
import type { StripeOnboardingStatus } from "@/modules/user/user.types";

const GENERIC_ERROR = "No pudimos iniciar la configuración de pagos. Intenta de nuevo.";
const NO_PROFILE = "No encontramos tu perfil de organizador.";
const NO_TAX_ID = "Completa tu RUC antes de configurar tus pagos.";
const ALREADY_COMPLETE = "Tu cuenta de pagos ya está configurada.";

/** Minimal session user the onboarding needs. */
interface OnboardingUser {
  id: string;
  email: string;
}

const fail = (error: string): ConnectLinkResult => ({ ok: false, error });

/**
 * Creates the connected account when missing and returns a fresh onboarding link. Safe to call
 * repeatedly or concurrently: the account is created once (idempotency key + conditional save).
 * Provider failures are logged here and reach the caller only as a generic message.
 */
export async function startConnectOnboarding(
  user: OnboardingUser,
  gateway: ConnectGateway = stripeConnectGateway,
): Promise<ConnectLinkResult> {
  const organizer = await findOrganizerByUserId(user.id);
  if (!organizer) return fail(NO_PROFILE);
  if (!organizer.taxId) return fail(NO_TAX_ID);
  if (organizer.stripeOnboardingStatus === "complete") return fail(ALREADY_COMPLETE);

  try {
    let accountId = organizer.stripeAccountId;
    if (!accountId) {
      const created = await gateway.createAccount({
        businessName: organizer.businessName,
        contactEmail: user.email,
        organizerId: organizer.id,
        idempotencyKey: `connect-account:${organizer.id}`,
      });
      // A concurrent request may have linked its account first: use the stored one.
      accountId = (await setStripeAccountId(organizer.id, created.accountId)) ?? null;
      if (!accountId) return fail(NO_PROFILE);
    }

    const { url } = await gateway.createOnboardingLink(accountId);
    return { ok: true, url };
  } catch (error) {
    // Never log the organizer's data (RUC): only the organizer id and the provider's message.
    console.error("[connect] onboarding failed", { organizerId: organizer.id, error: errorMessage(error) });
    return fail(GENERIC_ERROR);
  }
}

/**
 * Reads the account from the provider and stores the resulting onboarding status. Always uses the
 * retrieved state, so repeated or out-of-order events can't leave a stale value.
 * Returns the stored status, or `null` when no organizer owns `accountId`.
 * Emails the organizer when payouts turn on, or when a complete account goes back to pending.
 */
export async function syncConnectStatus(
  accountId: string,
  gateway: ConnectGateway = stripeConnectGateway,
): Promise<StripeOnboardingStatus | null> {
  const transfers = await gateway.getTransfersStatus(accountId);
  if (transfers === "rejected") console.error("[connect] account rejected", { accountId });

  const status = mapTransfersStatus(transfers);
  const owner = await findStripeAccountOwner(accountId);
  const found = await setStripeOnboardingStatus(accountId, status);
  const previous = owner?.stripeOnboardingStatus;
  if (found && owner && previous !== status && (status === "complete" || previous === "complete")) {
    await notifyConnectStatus(accountId, owner, status === "complete" ? "complete" : "pending");
  }
  return found ? status : null;
}

/** Syncs the account of the signed-in organizer (used when they return from the onboarding). */
export async function refreshConnectStatus(
  user: Pick<OnboardingUser, "id">,
  gateway: ConnectGateway = stripeConnectGateway,
): Promise<StripeOnboardingStatus | null> {
  const organizer = await findOrganizerByUserId(user.id);
  if (!organizer?.stripeAccountId) return null;
  return syncConnectStatus(organizer.stripeAccountId, gateway);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}
