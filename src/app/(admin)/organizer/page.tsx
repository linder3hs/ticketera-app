import type { Metadata } from "next";

import { canCreateEvent } from "@/modules/event/event.policy";
import { getSalesSummary, resolvePolicyActor } from "@/modules/event/services/event-list-service";
import { OrganizerDashboard } from "@/modules/organizer/components/OrganizerDashboard";
import { requireRole } from "@/modules/user/current-user";

export const metadata: Metadata = { title: "Panel de organizador — Ticketera" };

export default async function OrganizerPage() {
  const user = await requireRole("organizer");
  const [summary, actor] = await Promise.all([getSalesSummary(user), resolvePolicyActor(user)]);

  return (
    <OrganizerDashboard
      summary={summary}
      canCreate={canCreateEvent(actor)}
      organizerStatus={actor.organizerStatus}
      connectStatus={actor.stripeOnboardingStatus}
    />
  );
}
