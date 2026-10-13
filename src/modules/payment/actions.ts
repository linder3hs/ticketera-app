"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/modules/user/current-user";
import { startConnectOnboarding } from "@/modules/payment/services/connect-service";
import { setPlatformFeePercent } from "@/modules/payment/services/platform-fee-service";
import { platformFeePercentSchema } from "@/modules/payment/payment.schema";
import type { ConnectLinkResult } from "@/modules/payment/payment.types";
import type { ActionResult } from "@/modules/user/user.types";

/** Starts or resumes the payments onboarding of the signed-in organizer; the client redirects to `url`. */
export async function startConnectOnboardingAction(): Promise<ConnectLinkResult> {
  const user = await requireRole("organizer");
  return startConnectOnboarding(user);
}

/** Changes the platform fee for new orders. Super admin only, re-checked here: the page guard doesn't cover direct calls. */
export async function updatePlatformFeeAction(input: unknown): Promise<ActionResult> {
  const actor = await requireRole("super_admin");

  const parsed = platformFeePercentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "La comisión debe estar entre 0 y 100." };

  await setPlatformFeePercent(parsed.data, actor.id);
  revalidatePath("/admin/settings");
  return { ok: true, message: "Comisión actualizada." };
}
