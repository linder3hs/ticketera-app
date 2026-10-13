import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireRole } from "@/modules/user/current-user";
import { VenueForm } from "@/modules/venue/components/VenueForm";

export const metadata: Metadata = { title: "Crear recinto — Ticketera" };

export default async function CreateVenuePage() {
  await requireRole("organizer");

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
        <h1 className="text-[28px] leading-tight font-bold tracking-tight lg:text-4xl">Crear recinto</h1>
        <p className="text-sm text-muted-foreground">Después de guardarlo podrás agregar sus zonas y asientos.</p>
      </div>
      <VenueForm />
    </div>
  );
}
