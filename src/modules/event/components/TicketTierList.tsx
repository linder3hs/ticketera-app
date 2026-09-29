import { cn } from "@/lib/utils";
import { EventStatusBadge } from "@/modules/event/components/EventStatusBadge";
import { formatEventPrice } from "@/modules/event/event.utils";
import type { Zone } from "@/modules/booking/booking.types";

interface TicketTierListProps {
  zones: Zone[];
  className?: string;
}

/** Read-only price list of the venue's zones, cheapest last as in the map. */
export function TicketTierList({ zones, className }: TicketTierListProps) {
  return (
    <ul className={cn("flex flex-col", className)}>
      {zones.map((zone) => {
        const isSoldOut = zone.status === "sold-out";
        return (
          <li
            key={zone.id}
            className="flex min-h-[54px] items-center justify-between gap-3 border-b border-zinc-100 lg:min-h-14"
          >
            <span className="flex items-center gap-2.5">
              <span className="size-3 shrink-0 rounded" style={{ background: zone.color }} aria-hidden="true" />
              <span className={cn("text-[15px] font-medium", isSoldOut && "text-muted-foreground")}>
                {zone.name}
              </span>
              {zone.status === "last-tickets" && (
                <EventStatusBadge status={zone.status} className="h-[22px] text-[11px] font-semibold" />
              )}
            </span>
            {isSoldOut ? (
              <span className="text-sm font-semibold text-muted-foreground">Agotado</span>
            ) : (
              <span className="text-[15px] font-semibold">{formatEventPrice(zone.price, zone.currency)}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
