"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import {
  ArrowRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Pause,
  Play,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EventStatusBadge } from "@/modules/event/components/EventStatusBadge";
import {
  formatEventDateParts,
  formatEventPrice,
} from "@/modules/event/event.utils";
import type { Event } from "@/modules/event/event.types";

// Keep in sync with --animate-progress in globals.css.
const AUTOPLAY_MS = 6000;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeToReducedMotion(onChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

const getReducedMotion = () => window.matchMedia(REDUCED_MOTION_QUERY).matches;
const getServerReducedMotion = () => false;

const pad = (value: number) => String(value).padStart(2, "0");

interface FeaturedEventsCarouselProps {
  events: Event[];
}

/**
 * Hero carousel: solid panel with the event copy (always readable) next to
 * a crossfading photo, plus a tab rail with a progress bar. Autoplays every
 * 6 s unless the user prefers reduced motion; the pause button overrides
 * either way.
 */
export function FeaturedEventsCarousel({ events }: FeaturedEventsCarouselProps) {
  const [index, setIndex] = useState(0);
  // null = follow the reduced-motion preference; boolean = the user's choice.
  const [playChoice, setPlayChoice] = useState<boolean | null>(null);
  const prefersReducedMotion = useSyncExternalStore(
    subscribeToReducedMotion,
    getReducedMotion,
    getServerReducedMotion,
  );

  const count = events.length;
  const isPlaying = (playChoice ?? !prefersReducedMotion) && count > 1;

  // Re-arms on every slide change, so manual navigation restarts the timer.
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [isPlaying, index, count]);

  const current = events[index];
  if (!current) return null;

  const goTo = (next: number) => setIndex((next + count) % count);

  return (
    <section
      aria-roledescription="carrusel"
      aria-label="Eventos destacados"
      className="flex flex-col gap-4 lg:gap-[22px]"
    >
      <div className="flex flex-col overflow-hidden rounded-[28px] bg-indigo-950 lg:grid lg:h-[520px] lg:grid-cols-[520px_minmax(0,1fr)] lg:rounded-[32px]">
        <div className="relative h-[230px] bg-indigo-900 sm:h-[340px] lg:order-2 lg:h-auto">
          {events.map((event, i) => (
            <Image
              key={event.id}
              src={event.imageUrl}
              alt={event.imageAlt}
              aria-hidden={i !== index}
              fill
              sizes="(min-width: 1024px) 760px, 100vw"
              loading={i === 0 ? "eager" : undefined}
              fetchPriority={i === 0 ? "high" : undefined}
              className={cn(
                "object-cover transition-opacity duration-700 motion-reduce:transition-none",
                i === index ? "opacity-100" : "opacity-0",
              )}
            />
          ))}

          <EventStatusBadge
            status={current.status}
            className="absolute top-4 left-4 h-8 px-3.5 text-[13px] font-semibold lg:top-6 lg:left-6"
          />

          <div className="absolute right-3 bottom-3 flex gap-1 rounded-full bg-white p-1 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.45)] lg:right-6 lg:bottom-6 lg:p-1.5">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Evento anterior"
              onClick={() => goTo(index - 1)}
              className="size-11 cursor-pointer rounded-full text-foreground"
            >
              <ChevronLeft className="size-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={isPlaying ? "Pausar carrusel" : "Reproducir carrusel"}
              onClick={() => setPlayChoice(!isPlaying)}
              className="size-11 cursor-pointer rounded-full bg-muted text-foreground"
            >
              {isPlaying ? (
                <Pause className="size-4 fill-current" />
              ) : (
                <Play className="size-4 fill-current" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Evento siguiente"
              onClick={() => goTo(index + 1)}
              className="size-11 cursor-pointer rounded-full text-foreground"
            >
              <ChevronRight className="size-5" />
            </Button>
          </div>
        </div>

        <div
          aria-live={isPlaying ? "off" : "polite"}
          className="flex flex-col p-6 text-white lg:order-1 lg:p-12"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-2">
              <span className="flex h-8 items-center rounded-full bg-cta px-3.5 text-[13px] font-semibold text-cta-foreground">
                Destacado
              </span>
              <span className="flex h-8 items-center rounded-full border border-white/30 px-3.5 text-[13px] font-medium">
                {current.category}
              </span>
            </div>
            <span className="text-sm font-medium text-indigo-200 tabular-nums">
              {pad(index + 1)} / {pad(count)}
            </span>
          </div>

          <h2 className="mt-5 text-[26px] leading-[1.15] font-bold tracking-tight text-balance lg:mt-7 lg:text-[44px] lg:leading-[1.1]">
            {current.title}
          </h2>

          <ul className="mt-4 flex flex-col gap-2 text-sm text-indigo-100 lg:mt-5 lg:gap-2.5 lg:text-base">
            <li className="flex items-center gap-2.5">
              <Calendar className="size-4 shrink-0 lg:size-[18px]" aria-hidden="true" />
              {formatEventDateParts(current.date).long}
            </li>
            <li className="flex items-center gap-2.5">
              <MapPin className="size-4 shrink-0 lg:size-[18px]" aria-hidden="true" />
              {current.venue}, {current.city}
            </li>
          </ul>

          <div className="mt-6 lg:mt-auto">
            <p className="flex items-baseline gap-2">
              <span className="text-sm text-indigo-200">Desde</span>
              <span className="text-2xl font-bold tracking-tight lg:text-3xl">
                {formatEventPrice(current.priceFrom, current.currency)}
              </span>
            </p>
            <div className="mt-3.5 flex gap-2.5">
              <Button
                variant="cta"
                className="h-[52px] flex-1 cursor-pointer gap-2 rounded-2xl text-base font-semibold"
              >
                Comprar entradas
                <ArrowRight className="size-[18px]" aria-hidden="true" />
              </Button>
              <Button
                variant="outline"
                className="hidden h-[52px] cursor-pointer rounded-2xl border-white/40 bg-transparent px-5 text-base text-white hover:bg-white/10 hover:text-white sm:inline-flex"
              >
                Ver detalles
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="scroll-row gap-3 pb-1 lg:mx-0 lg:grid lg:grid-cols-5 lg:gap-4 lg:overflow-visible lg:px-0">
        {events.map((event, i) => {
          const isActive = i === index;
          return (
            <button
              key={event.id}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Ver ${event.title}`}
              aria-current={isActive}
              className="flex w-[220px] min-w-0 shrink-0 cursor-pointer snap-start flex-col gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:w-auto lg:gap-3.5"
            >
              <span className="block h-[3px] w-full overflow-hidden rounded-full bg-zinc-200">
                {isActive && (
                  <span
                    className={cn(
                      "block h-full bg-primary",
                      isPlaying ? "animate-progress motion-reduce:w-full motion-reduce:animate-none" : "w-full",
                    )}
                  />
                )}
              </span>
              <span className="flex items-center gap-3">
                <Image
                  src={event.imageUrl}
                  alt=""
                  width={56}
                  height={56}
                  className={cn(
                    "size-12 shrink-0 rounded-xl object-cover lg:size-14 lg:rounded-[14px]",
                    !isActive && "opacity-70",
                  )}
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span
                    className={cn(
                      "truncate text-[13px] font-semibold lg:text-sm",
                      isActive ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {event.title}
                  </span>
                  <span className="truncate text-xs text-muted-foreground lg:text-[13px]">
                    {formatEventDateParts(event.date).short} · {event.city}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
