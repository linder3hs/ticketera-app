import { cn } from "@/lib/utils";
import { formatEventPrice } from "@/modules/event/event.utils";
import type { Zone } from "@/modules/booking/booking.types";

interface ZoneLegendProps {
  zones: Zone[];
  activeZoneId: string | null;
  /** Tickets picked per zone. */
  counts: Record<string, number>;
  onSelect: (zoneId: string) => void;
}

/**
 * Zones and prices as toggle chips: the same choice as tapping the map, in a
 * list that also works for screen readers and small screens.
 */
export function ZoneLegend({ zones, activeZoneId, counts, onSelect }: ZoneLegendProps) {
  return (
    <ul aria-label="Zonas y precios" className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {zones.map((zone) => {
        const isSoldOut = zone.status === "sold-out";
        const isActive = zone.id === activeZoneId;
        const count = counts[zone.id] ?? 0;

        return (
          <li key={zone.id}>
            <button
              type="button"
              aria-pressed={isActive}
              disabled={isSoldOut}
              onClick={() => onSelect(zone.id)}
              className={cn(
                "flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-2xl border-[1.5px] px-3.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60",
                isActive ? "border-foreground bg-indigo-50" : "border-border bg-background hover:border-zinc-400",
              )}
            >
              <span className="size-4 shrink-0 rounded-[5px]" style={{ background: zone.color }} aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold">{zone.name}</span>
                <span className="text-xs text-muted-foreground">
                  {isSoldOut
                    ? "Agotado"
                    : `${formatEventPrice(zone.price, zone.currency)} · ${zone.kind === "seated" ? "Numerado" : "De pie"}`}
                  {zone.status === "last-tickets" && <span className="font-semibold text-orange-800"> · Últimas</span>}
                </span>
              </span>
              {count > 0 && (
                <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-indigo-900 px-1.5 text-xs font-semibold text-white">
                  {count}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
