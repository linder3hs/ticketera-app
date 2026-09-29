import type { Metadata } from "next";

import { OrganizerDashboard } from "@/modules/organizer/components/OrganizerDashboard";
import { OrganizerShell } from "@/modules/organizer/components/OrganizerShell";
import { getOrganizerEvents } from "@/modules/organizer/services/organizer-service";

export const metadata: Metadata = { title: "Panel de organizador — Ticketera" };

export default async function OrganizerPage() {
  const events = await getOrganizerEvents();

  return (
    <OrganizerShell active="summary">
      <OrganizerDashboard sampleEvents={events} />
    </OrganizerShell>
  );
}
