"use client";

import { ArrowLeft, ChevronRight } from "lucide-react";

import { formatEventPrice } from "@/modules/event/event.utils";
import { EventStatusBadge } from "@/modules/event/components/EventStatusBadge";
import { MAX_TICKETS_PER_ZONE } from "@/modules/booking/booking.store";
import type { Seat, VenueMap, Zone } from "@/modules/booking/booking.types";
import { GeneralAdmissionPanel } from "@/modules/booking/components/GeneralAdmissionPanel";
import { SeatLegend, SeatMap } from "@/modules/booking/components/SeatMap";
import { VenueOverview } from "@/modules/booking/components/VenueOverview";
import { ZoneLegend } from "@/modules/booking/components/ZoneLegend";

interface VenueExplorerProps {
  venue: Pick<VenueMap, "viewBox" | "stage" | "zones">;
  activeZoneId: string | null;
  seats: Record<string, Seat[]>;
  quantities: Record<string, number>;
  /** Tickets picked per zone. */
  counts: Record<string, number>;
  onSelectZone: (zoneId: string | null) => void;
  onToggleSeat: (zone: Zone, seat: Seat) => void;
  onChangeQuantity: (zone: Zone, quantity: number) => void;
}

/**
 * One panel, two levels: the whole stadium to pick a zone, then that zone
 * (its seats, or a quantity picker for standing zones). The zone legend below
 * works as a list alternative to the map.
 */
export function VenueExplorer({
  venue,
  activeZoneId,
  seats,
  quantities,
  counts,
  onSelectZone,
  onToggleSeat,
  onChangeQuantity,
}: VenueExplorerProps) {
  const zone = venue.zones.find((item) => item.id === activeZoneId && item.status !== "sold-out");
  const selectedSeatIds = new Set((zone ? (seats[zone.id] ?? []) : []).map((seat) => seat.id));
  const isFull = selectedSeatIds.size >= MAX_TICKETS_PER_ZONE;

  return (
    <section
      aria-label="Elige tus entradas"
      className="flex flex-col gap-4 rounded-[22px] border border-border bg-card px-4 pt-[18px] pb-4 lg:gap-5 lg:rounded-3xl lg:px-7 lg:pt-6 lg:pb-7"
    >
      {zone ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onSelectZone(null)}
              className="-ml-2 flex h-11 cursor-pointer items-center gap-1.5 rounded-xl px-2 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Todas las zonas
            </button>
            <nav aria-label="Ubicación en el mapa" className="text-[13px] text-muted-foreground">
              <ol className="flex items-center gap-1">
                <li>Estadio</li>
                <li aria-hidden="true">
                  <ChevronRight className="size-3.5" />
                </li>
                <li aria-current="location" className="font-medium text-foreground">
                  {zone.name}
                </li>
              </ol>
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="size-4 rounded-[5px]" style={{ background: zone.color }} aria-hidden="true" />
            <h2 className="text-lg font-semibold lg:text-xl">{zone.name}</h2>
            <span className="text-[15px] text-muted-foreground">
              {formatEventPrice(zone.price, zone.currency)} {zone.kind === "seated" ? "por asiento" : "por entrada"}
            </span>
            {zone.status === "last-tickets" && (
              <EventStatusBadge status={zone.status} className="h-6 text-[11px] font-semibold" />
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold lg:text-xl">Elige tu zona</h2>
          <span className="text-xs text-muted-foreground lg:text-[13px]">Toca una zona del mapa o de la lista</span>
        </div>
      )}

      {zone?.kind === "seated" && (
        <>
          <SeatMap
            zone={zone}
            selectedSeatIds={selectedSeatIds}
            isFull={isFull}
            onToggleSeat={(seat) => onToggleSeat(zone, seat)}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <SeatLegend zoneColor={zone.color} />
            <p aria-live="polite" className="text-[13px] font-medium text-orange-800">
              {isFull
                ? `Llegaste al máximo de ${MAX_TICKETS_PER_ZONE} entradas en esta zona`
                : "Arrastra o pellizca para moverte · usa las flechas del teclado"}
            </p>
          </div>
        </>
      )}

      {zone?.kind === "general" && (
        <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-4 md:grid-cols-2">
          <VenueOverview venue={venue} activeZoneId={zone.id} onSelect={onSelectZone} className="hidden md:block" />
          <GeneralAdmissionPanel
            zone={zone}
            quantity={quantities[zone.id] ?? 0}
            onChange={(quantity) => onChangeQuantity(zone, quantity)}
          />
        </div>
      )}

      {!zone && (
        <div className="rounded-2xl bg-zinc-50 p-2 sm:p-4">
          <VenueOverview venue={venue} activeZoneId={null} onSelect={onSelectZone} />
        </div>
      )}

      <ZoneLegend zones={venue.zones} activeZoneId={zone?.id ?? null} counts={counts} onSelect={onSelectZone} />
    </section>
  );
}
