import { redirect } from "next/navigation";

import { startConnectOnboarding } from "@/modules/payment/services/connect-service";
import { requireRole } from "@/modules/user/current-user";

const SETTINGS_PATH = "/organizer/settings";

/**
 * Stripe sends the organizer here when an onboarding link expired or was already used. Issues a fresh
 * link; without a session (sign-in), without an organizer profile, when payments are already set up
 * or on any error it lands on the settings page instead.
 */
export async function GET() {
  const user = await requireRole("organizer");
  const result = await startConnectOnboarding(user);
  redirect(result.ok ? result.url : SETTINGS_PATH);
}
