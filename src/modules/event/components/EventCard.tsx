import Image from "next/image";
import { Calendar, MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EventStatusBadge } from "@/modules/event/components/EventStatusBadge";
import {
  formatEventDateParts,
  formatEventPrice,
} from "@/modules/event/event.utils";
import type { Event } from "@/modules/event/event.types";

interface EventCardProps {
  event: Event;
}

// Half-circle cut-outs of the ticket perforation; they take the section's
// `bg-muted` so they read as holes in the card.
const NOTCH_CLASS = "absolute size-5 rounded-full border border-border bg-muted";

/**
 * Ticket-style event card: a compact row on phones, a vertical card with a
 * perforated stub from `sm` up.
 */
export function EventCard({ event }: EventCardProps) {
  const date = formatEventDateParts(event.date);
  const isSoldOut = event.status === "sold-out";

  return (
    <article className="flex overflow-hidden rounded-[20px] border border-border bg-card transition duration-300 hover:shadow-[0_20px_40px_-20px_rgba(24,24,27,0.35)] motion-safe:hover:-translate-y-1 sm:flex-col sm:rounded-[22px]">
      <div className="relative w-[108px] shrink-0 bg-zinc-200 sm:h-[184px] sm:w-full">
        <Image
          src={event.imageUrl}
          alt={event.imageAlt}
          fill
          sizes="(min-width: 1024px) 300px, (min-width: 640px) 50vw, 108px"
          className="object-cover"
        />
        <span className="absolute top-2 left-2 flex w-11 flex-col items-center rounded-[11px] bg-white py-1 shadow-[0_4px_14px_-6px_rgba(0,0,0,0.35)] sm:top-3 sm:left-3 sm:w-14 sm:rounded-[14px] sm:py-1.5">
          <span className="text-[10px] font-bold tracking-widest text-primary sm:text-[11px]">
            {date.month}
          </span>
          <span className="text-[17px] leading-none font-bold text-foreground sm:text-[22px]">
            {date.day}
          </span>
        </span>
        <EventStatusBadge
          status={event.status}
          className="absolute top-3 right-3 hidden h-7 px-3 font-semibold sm:inline-flex"
        />
      </div>

      <div className="relative flex min-w-0 flex-1 flex-col border-l-[1.5px] border-dashed border-zinc-300 sm:border-l-0">
        <span className={`${NOTCH_CLASS} -top-2.5 -left-2.5 sm:hidden`} />
        <span className={`${NOTCH_CLASS} -bottom-2.5 -left-2.5 sm:hidden`} />

        <div className="flex flex-1 flex-col gap-1 px-3.5 pt-3 sm:gap-2 sm:px-5 sm:pt-[18px]">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[11px] font-semibold tracking-wider text-primary uppercase sm:text-xs">
              {event.category}
            </span>
            <EventStatusBadge status={event.status} className="font-semibold sm:hidden" />
          </div>
          <h3 className="line-clamp-2 text-[15px] leading-snug font-semibold sm:min-h-[46px] sm:text-[17px]">
            {event.title}
          </h3>
          <p className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
            <MapPin className="hidden size-4 shrink-0 sm:block" aria-hidden="true" />
            <span className="truncate">
              {event.venue} · {event.city}
            </span>
          </p>
          <p className="hidden items-center gap-2 text-sm text-muted-foreground sm:flex">
            <Calendar className="size-4 shrink-0" aria-hidden="true" />
            {date.short}
          </p>
        </div>

        <div className="relative mt-[18px] hidden border-t-[1.5px] border-dashed border-zinc-300 sm:block">
          <span className={`${NOTCH_CLASS} -top-2.5 -left-2.5`} />
          <span className={`${NOTCH_CLASS} -top-2.5 -right-2.5`} />
        </div>

        <div className="flex items-center justify-between gap-3 px-3.5 pt-2 pb-3 sm:px-5 sm:pt-4 sm:pb-5">
          <p className="flex items-baseline gap-1.5 sm:flex-col sm:gap-0">
            <span className="text-xs text-muted-foreground">Desde</span>
            <span className="text-base font-bold tracking-tight text-orange-700 sm:text-[19px]">
              {formatEventPrice(event.priceFrom, event.currency)}
            </span>
          </p>
          <Button
            variant="outline"
            disabled={isSoldOut}
            className="h-11 cursor-pointer rounded-xl border-[1.5px] border-foreground px-4 font-semibold disabled:border-transparent disabled:bg-muted disabled:opacity-100"
          >
            {isSoldOut ? "Agotado" : "Ver entradas"}
          </Button>
        </div>
      </div>
    </article>
  );
}
