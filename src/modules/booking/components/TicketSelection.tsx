"use client";

import { useEffect, useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { formatEventDateParts } from "@/modules/event/event.utils";
import type { Event } from "@/modules/event/event.types";
import {
  MAX_TICKETS_PER_ZONE,
  getOrderLines,
  getOrderTotals,
  useBookingStore,
} from "@/modules/booking/booking.store";
import type { Seat, Zone } from "@/modules/booking/booking.types";
import { OrderSummary } from "@/modules/booking/components/OrderSummary";
import { SeatLegend, SeatMap } from "@/modules/booking/components/SeatMap";
import { ZoneMap } from "@/modules/booking/components/ZoneMap";
import { ZoneQuantityList } from "@/modules/booking/components/ZoneQuantityList";

interface TicketSelectionProps {
  event: Pick<Event, "id" | "title" | "date" | "venue" | "city" | "imageUrl" | "currency">;
  zones: Zone[];
}

const CARD_CLASS = "flex flex-col rounded-[22px] border border-border bg-card lg:rounded-3xl";
const NO_SEATS: Record<string, Seat[]> = {};
const NO_QUANTITIES: Record<string, number> = {};

/** First zone to show: a numbered stand with tickets, else any zone on sale. */
function getDefaultZoneId(zones: Zone[]) {
  const onSale = zones.filter((zone) => zone.status !== "sold-out");
  return (onSale.find((zone) => zone.kind === "seated") ?? onSale[0])?.id ?? null;
}

/** Ticket picking step: zone map, seat map, per-zone list and summary. */
export function TicketSelection({ event, zones }: TicketSelectionProps) {
  const store = useBookingStore();
  // Until `init` runs, the store may still hold another event's selection.
  const isCurrent = store.eventId === event.id;
  const seats = isCurrent ? store.seats : NO_SEATS;
  const quantities = isCurrent ? store.quantities : NO_QUANTITIES;
  const activeZoneId = isCurrent ? store.activeZoneId : getDefaultZoneId(zones);
  const { init } = store;

  useEffect(() => {
    init(event.id, getDefaultZoneId(zones));
  }, [init, event.id, zones]);

  const lines = useMemo(() => getOrderLines(zones, { seats, quantities }), [zones, seats, quantities]);
  const { count, total } = getOrderTotals(lines);
  const counts = Object.fromEntries(lines.map((line) => [line.zoneId, line.quantity]));

  const activeZone = zones.find((zone) => zone.id === activeZoneId);
  const activeSeatIds = new Set((activeZone ? seats[activeZone.id] ?? [] : []).map((seat) => seat.id));
  const isActiveZoneFull = activeSeatIds.size >= MAX_TICKETS_PER_ZONE;
  const date = formatEventDateParts(event.date);

  return (
    <>
      <div className="border-b border-zinc-100 bg-background lg:border-0 lg:bg-transparent">
        <div className="mx-auto hidden max-w-7xl px-6 pt-6 lg:block">
          <Link
            href={`/events/${event.id}`}
            className="flex h-8 w-fit items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Volver al evento
          </Link>
        </div>
        <div className="mx-auto flex max-w-7xl items-center gap-3 p-4 md:px-6 lg:gap-4 lg:pt-4 lg:pb-7">
          <div className="relative size-[52px] shrink-0 overflow-hidden rounded-[14px] lg:size-16 lg:rounded-2xl">
            <Image src={event.imageUrl} alt="" fill sizes="64px" className="object-cover" />
          </div>
          <div className="flex min-w-0 flex-col gap-px lg:gap-0.5">
            <h1 className="truncate text-[15px] font-semibold lg:text-[26px] lg:leading-tight lg:font-bold lg:tracking-tight">
              {event.title}
            </h1>
            <p className="truncate text-[13px] text-muted-foreground lg:text-[15px]">
              <span className="lg:hidden">{date.short}</span>
              <span className="hidden lg:inline">{date.long}</span> · {event.venue}, {event.city}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-4 p-4 md:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-8 lg:pt-0 lg:pb-20">
        <div className="flex flex-col gap-4 lg:gap-6">
          <section className={`${CARD_CLASS} gap-3.5 px-4 pt-[18px] pb-4 lg:gap-[18px] lg:px-7 lg:pt-6 lg:pb-7`}>
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold lg:text-xl">Elige tu zona</h2>
              <span className="text-xs text-muted-foreground lg:text-[13px]">Toca una zona del mapa</span>
            </div>
            <ZoneMap zones={zones} activeZoneId={activeZoneId} onSelect={store.setActiveZone} />
          </section>

          {activeZone?.kind === "seated" && (
            <section className={`${CARD_CLASS} gap-3.5 px-4 pt-[18px] pb-4 lg:gap-[18px] lg:px-7 lg:pt-6 lg:pb-7`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 className="text-lg font-semibold lg:text-xl">Elige tus asientos · {activeZone.shortName}</h2>
                <span className="text-xs text-muted-foreground lg:text-[13px]">
                  Arrastra o pellizca para moverte
                </span>
              </div>
              <SeatMap
                zone={activeZone}
                selectedSeatIds={activeSeatIds}
                isFull={isActiveZoneFull}
                onToggleSeat={(seat) => store.toggleSeat(activeZone, seat)}
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <SeatLegend />
                <p aria-live="polite" className="text-[13px] font-medium text-orange-800">
                  {isActiveZoneFull && `Máximo ${MAX_TICKETS_PER_ZONE} entradas por zona`}
                </p>
              </div>
            </section>
          )}

          <section className={`${CARD_CLASS} px-4 py-1 lg:px-7 lg:py-2`}>
            <h2 className="pt-3.5 pb-1.5 text-lg font-semibold lg:pt-4 lg:pb-2 lg:text-xl">Entradas</h2>
            <ZoneQuantityList
              zones={zones}
              activeZoneId={activeZoneId}
              counts={counts}
              onSelectZone={store.setActiveZone}
              onChangeQuantity={(zone, quantity) => {
                store.setActiveZone(zone.id);
                store.setQuantity(zone, quantity);
              }}
            />
            <p className="border-t border-zinc-100 pt-3.5 pb-[18px] text-[13px] text-muted-foreground">
              Máximo {MAX_TICKETS_PER_ZONE} entradas por zona.
            </p>
          </section>
        </div>

        <OrderSummary
          lines={lines}
          count={count}
          total={total}
          currency={event.currency}
          onRemoveSeat={store.removeSeat}
        />
      </div>
    </>
  );
}
