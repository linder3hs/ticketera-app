import Link from "next/link";
import { CalendarX } from "lucide-react";

import { EventCard } from "@/modules/event/components/EventCard";
import type { Event } from "@/modules/event/event.types";

interface EventGridProps {
  events: Event[];
  /** Active category filter, named in the empty state. */
  categoryLabel?: string;
  /** Columns from `lg`; 3 fits next to the search filters. */
  columns?: 3 | 4;
}

export function EventGrid({ events, categoryLabel, columns = 4 }: EventGridProps) {
  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-3xl border-[1.5px] border-dashed border-zinc-300 bg-card px-5 py-12 text-center lg:py-[72px]">
        <span className="flex size-14 items-center justify-center rounded-[18px] bg-indigo-50 text-primary">
          <CalendarX className="size-6" aria-hidden="true" />
        </span>
        <h3 className="text-lg font-semibold lg:text-xl">
          Todavía no hay eventos{categoryLabel ? ` de ${categoryLabel}` : ""}
        </h3>
        <p className="max-w-[420px] text-sm leading-relaxed text-muted-foreground lg:text-[15px]">
          Estamos sumando nuevas fechas. Mientras tanto, mira todo lo que viene.
        </p>
        <Link
          href="/#eventos"
          className="mt-2 flex h-12 items-center rounded-[14px] bg-foreground px-5 text-[15px] font-semibold text-background focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Ver todos los eventos
        </Link>
      </div>
    );
  }

  return (
    <div
      className={`grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-6 ${columns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}
    >
      {events.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
}
