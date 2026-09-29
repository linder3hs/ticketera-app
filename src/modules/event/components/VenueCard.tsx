import { MapPin } from "lucide-react";

import type { EventDetail } from "@/modules/event/event.types";

interface VenueCardProps {
  event: Pick<EventDetail, "venue" | "address" | "city">;
}

/** Venue name and address; the map is a placeholder until maps are wired up. */
export function VenueCard({ event }: VenueCardProps) {
  const directionsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${event.venue}, ${event.address}, ${event.city}`,
  )}`;

  return (
    <div className="overflow-hidden rounded-[20px] border border-border lg:rounded-[22px]">
      <div className="flex h-[170px] flex-col items-center justify-center gap-2 bg-indigo-50 text-indigo-700 lg:h-60">
        <MapPin className="size-7" aria-hidden="true" />
        <span className="text-[13px] font-semibold lg:text-sm">Mapa del lugar</span>
      </div>
      <div className="flex items-center justify-between gap-3 px-[18px] py-4 lg:px-6 lg:py-5">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-base font-semibold lg:text-[17px]">{event.venue}</span>
          <span className="text-[13px] text-muted-foreground lg:text-sm">
            {event.address}, {event.city}
          </span>
        </div>
        <a
          href={directionsUrl}
          target="_blank"
          rel="noreferrer"
          className="flex h-11 shrink-0 items-center rounded-xl border-[1.5px] border-foreground px-3.5 text-sm font-semibold whitespace-nowrap focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:px-4"
        >
          Cómo llegar
        </a>
      </div>
    </div>
  );
}
