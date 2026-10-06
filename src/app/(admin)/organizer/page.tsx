import type { Metadata } from "next";

import { canCreateEvent } from "@/modules/event/event.policy";
import { getSalesSummary } from "@/modules/event/services/event-list-service";
import { OrganizerDashboard } from "@/modules/organizer/components/OrganizerDashboard";
import { requireRole } from "@/modules/user/current-user";
import { findOrganizerByUserId } from "@/modules/user/services/user-service";

export const metadata: Metadata = { title: "Panel de organizador — Ticketera" };

export default async function OrganizerPage() {
  const user = await requireRole("organizer");
  const [summary, organizer] = await Promise.all([getSalesSummary(user), findOrganizerByUserId(user.id)]);
  const organizerStatus = organizer?.status ?? null;
  const canCreate = canCreateEvent({ role: user.role, organizerId: organizer?.id ?? null, organizerStatus });

  return <OrganizerDashboard summary={summary} canCreate={canCreate} organizerStatus={organizerStatus} />;
}
