import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireRole } from "@/modules/user/current-user";
import { VenueForm } from "@/modules/venue/components/VenueForm";
import { VenueZonesEditor } from "@/modules/venue/components/VenueZonesEditor";
import { getVenueForEdit } from "@/modules/venue/services/venue-service";

export const metadata: Metadata = { title: "Recinto — Ticketera" };

export default async function VenuePage({ params }: PageProps<"/organizer/venues/[id]">) {
  const user = await requireRole("organizer");
  const { id } = await params;
  const venue = await getVenueForEdit({ id: user.id, role: user.role }, id);
  if (!venue) notFound();

  const { capabilities } = venue;

  return (
    <div className="flex flex-col gap-5 lg:gap-7">
      <div className="flex flex-col gap-2">
        <Link
          href="/organizer/venues"
          className="flex h-11 w-fit items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Recintos
        </Link>
        <h1 className="text-[28px] leading-tight font-bold tracking-tight lg:text-4xl">{venue.values.name}</h1>
      </div>
      <VenueForm venue={{ id: venue.id, values: venue.values }} readOnly={!capabilities.edit} reason={venue.editBlockedReason} />
      <VenueZonesEditor venueId={venue.id} zones={venue.zones} capabilities={capabilities} lockedReason={venue.zonesBlockedReason} />
    </div>
  );
}
