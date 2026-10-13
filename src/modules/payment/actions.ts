"use server";

import { requireRole } from "@/modules/user/current-user";
import { startConnectOnboarding } from "@/modules/payment/services/connect-service";
import type { ConnectLinkResult } from "@/modules/payment/payment.types";

/** Starts or resumes the payments onboarding of the signed-in organizer; the client redirects to `url`. */
export async function startConnectOnboardingAction(): Promise<ConnectLinkResult> {
  const user = await requireRole("organizer");
  return startConnectOnboarding(user);
}
