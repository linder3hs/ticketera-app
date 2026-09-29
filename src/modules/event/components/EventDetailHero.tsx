import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Calendar, Clock, MapPin, Share2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { SaveEventButton } from "@/modules/event/components/SaveEventButton";
import { formatEventDateParts, formatEventPrice } from "@/modules/event/event.utils";
import type { EventDetail } from "@/modules/event/event.types";

interface EventDetailHeroProps {
  event: EventDetail;
}

const ICON_BUTTON_CLASS =
  "flex size-[54px] shrink-0 items-center justify-center rounded-2xl border-[1.5px] border-white/40 text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/60";

/**
 * Split hero: text panel on the indigo ground and the photo. The photo goes
 * on top on phones; the buy CTA is only here from `lg` (phones use the
 * bottom purchase bar).
 */
export function EventDetailHero({ event }: EventDetailHeroProps) {
  const isSoldOut = event.status === "sold-out";

  return (
    <div className="flex flex-col overflow-hidden rounded-[28px] bg-indigo-950 lg:grid lg:h-[460px] lg:grid-cols-[minmax(0,540px)_minmax(0,1fr)] lg:rounded-[32px]">
      <div className="relative h-[220px] sm:h-[300px] lg:order-2 lg:h-full">
        <Image
          src={event.imageUrl}
          alt={event.imageAlt}
          fill
          priority
          sizes="(min-width: 1024px) 60vw, 100vw"
          className="object-cover"
        />
      </div>

      <div className="flex flex-col p-[22px] pb-6 text-white lg:order-1 lg:px-12 lg:py-11">
        <span className="flex h-7 w-fit items-center rounded-full border border-white/30 px-3 text-xs font-medium lg:h-8 lg:px-3.5 lg:text-[13px]">
          {event.category}
        </span>
        <h1 className="mt-3.5 text-[28px] leading-[1.12] font-bold tracking-tight text-balance lg:mt-6 lg:text-[46px] lg:leading-[1.08]">
          {event.title}
        </h1>
        <ul className="mt-3.5 flex flex-col gap-2 text-sm text-indigo-100 lg:mt-5 lg:gap-2.5 lg:text-base">
          <li className="flex items-center gap-2 lg:gap-2.5">
            <Calendar className="size-4 shrink-0 lg:size-[18px]" aria-hidden="true" />
            {formatEventDateParts(event.date).long}
          </li>
          <li className="flex items-center gap-2 lg:gap-2.5">
            <Clock className="size-4 shrink-0 lg:size-[18px]" aria-hidden="true" />
            {event.startsAt} h
          </li>
          <li className="flex items-center gap-2 lg:gap-2.5">
            <MapPin className="size-4 shrink-0 lg:size-[18px]" aria-hidden="true" />
            {event.venue}, {event.city}
          </li>
        </ul>

        <div className="mt-5 flex items-center gap-2.5 lg:mt-auto">
          {isSoldOut ? (
            <span className="hidden h-[54px] flex-1 items-center justify-center rounded-2xl bg-white/15 text-base font-semibold lg:flex">
              Agotado
            </span>
          ) : (
            <Link
              href={`/events/${event.id}/tickets`}
              className={cn(buttonVariants({ variant: "cta" }), "hidden h-[54px] flex-1 cursor-pointer gap-2 rounded-2xl text-base font-semibold lg:inline-flex")}
            >
              Comprar entradas · desde {formatEventPrice(event.priceFrom, event.currency)}
              <ArrowRight className="size-[18px]" aria-hidden="true" />
            </Link>
          )}
          <SaveEventButton className={ICON_BUTTON_CLASS} />
          <button type="button" aria-label="Compartir evento" className={cn(ICON_BUTTON_CLASS, "cursor-pointer")}>
            <Share2 className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
