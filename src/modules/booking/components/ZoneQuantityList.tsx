import { Minus, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { EventStatusBadge } from "@/modules/event/components/EventStatusBadge";
import { formatEventPrice } from "@/modules/event/event.utils";
import { MAX_TICKETS_PER_ZONE } from "@/modules/booking/booking.store";
import type { Zone } from "@/modules/booking/booking.types";

interface ZoneQuantityListProps {
  zones: Zone[];
  activeZoneId: string | null;
  /** Tickets picked per zone (seats or quantity). */
  counts: Record<string, number>;
  onSelectZone: (zoneId: string) => void;
  onChangeQuantity: (zone: Zone, quantity: number) => void;
}

const STEP_BUTTON_CLASS =
  "flex size-10 cursor-pointer items-center justify-center rounded-[11px] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * One row per zone: standing zones get a +/- stepper, numbered zones a
 * button that opens their seat map.
 */
export function ZoneQuantityList({
  zones,
  activeZoneId,
  counts,
  onSelectZone,
  onChangeQuantity,
}: ZoneQuantityListProps) {
  return (
    <ul className="flex flex-col">
      {zones.map((zone) => {
        const count = counts[zone.id] ?? 0;
        const isSoldOut = zone.status === "sold-out";

        return (
          <li
            key={zone.id}
            className={cn(
              "-mx-2 flex min-h-[72px] items-center gap-3 rounded-xl border-t border-zinc-100 px-2 lg:-mx-3 lg:min-h-[76px] lg:gap-4 lg:rounded-[14px] lg:px-3",
              zone.id === activeZoneId && "bg-indigo-50",
            )}
          >
            <span className="size-3 shrink-0 rounded lg:size-3.5" style={{ background: zone.color }} aria-hidden="true" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-semibold lg:text-base">
                {zone.name}
                {zone.status === "last-tickets" && (
                  <EventStatusBadge status={zone.status} className="h-[22px] text-[11px] font-semibold" />
                )}
              </span>
              <span className="text-[13px] text-muted-foreground lg:text-sm">
                {formatEventPrice(zone.price, zone.currency)} c/u
                {zone.kind === "seated" && " · Asiento numerado"}
              </span>
            </span>

            {isSoldOut ? (
              <span className="flex h-11 items-center rounded-xl bg-muted px-4 text-sm font-semibold text-muted-foreground">
                Agotado
              </span>
            ) : zone.kind === "seated" ? (
              <button
                type="button"
                onClick={() => onSelectZone(zone.id)}
                className="flex h-11 shrink-0 cursor-pointer items-center rounded-xl border-[1.5px] border-foreground px-3.5 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {count > 0 ? `${count} ${count === 1 ? "asiento" : "asientos"}` : "Elegir asientos"}
              </button>
            ) : (
              <span className="flex shrink-0 items-center gap-1 rounded-[14px] border border-border p-[3px]">
                <button
                  type="button"
                  aria-label={`Quitar una entrada de ${zone.name}`}
                  disabled={count === 0}
                  onClick={() => onChangeQuantity(zone, count - 1)}
                  className={cn(STEP_BUTTON_CLASS, "bg-muted text-foreground")}
                >
                  <Minus className="size-[18px]" aria-hidden="true" />
                </button>
                <span aria-live="polite" className="w-8 text-center text-base font-semibold tabular-nums">
                  {count}
                </span>
                <button
                  type="button"
                  aria-label={`Agregar una entrada de ${zone.name}`}
                  disabled={count >= MAX_TICKETS_PER_ZONE}
                  onClick={() => onChangeQuantity(zone, count + 1)}
                  className={cn(STEP_BUTTON_CLASS, "bg-foreground text-background")}
                >
                  <Plus className="size-[18px]" aria-hidden="true" />
                </button>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
