import type { Metadata } from "next";

import { requireRole } from "@/modules/user/current-user";
import { VenueList } from "@/modules/venue/components/VenueList";
import { listVenues } from "@/modules/venue/services/venue-service";

export const metadata: Metadata = { title: "Recintos — Ticketera" };

export default async function VenuesPage() {
  const user = await requireRole("organizer");
  const rows = await listVenues({ id: user.id, role: user.role });

  return <VenueList rows={rows} />;
}
