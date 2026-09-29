import type { KeyboardEvent } from "react";

import { cn } from "@/lib/utils";
import { formatEventPrice } from "@/modules/event/event.utils";
import type { VenueMap, Zone } from "@/modules/booking/booking.types";

interface VenueOverviewProps {
  venue: Pick<VenueMap, "viewBox" | "stage" | "zones">;
  activeZoneId: string | null;
  onSelect: (zoneId: string) => void;
  className?: string;
}

/** True when white text reads better than dark text on `hex`. */
function isDarkColor(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

/**
 * Bird's-eye stadium: stage on top, standing zones on the field and curved
 * stands around it, each filled with its color and labelled with its price.
 * Zones on sale are keyboard-operable buttons; sold-out ones are hatched.
 */
export function VenueOverview({ venue, activeZoneId, onSelect, className }: VenueOverviewProps) {
  const { stage } = venue;

  function handleKeyDown(event: KeyboardEvent, zone: Zone) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onSelect(zone.id);
  }

  return (
    <svg viewBox={venue.viewBox} role="group" aria-label="Mapa del estadio" className={cn("block h-auto w-full", className)}>
      <defs>
        <pattern id="sold-out-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" className="fill-zinc-100" />
          <line x1="0" y1="0" x2="0" y2="8" className="stroke-zinc-300 [stroke-width:3]" />
        </pattern>
      </defs>

      <g aria-hidden="true">
        {/* Bowl outline and field. */}
        <path d="M40 50 L760 50 Q800 270 720 460 Q400 580 80 460 Q0 270 40 50 Z" className="fill-zinc-100" />
        <rect x={206} y={86} width={388} height={300} rx={18} className="fill-emerald-50 stroke-emerald-200 [stroke-width:1.5]" />
        <rect x={stage.x} y={stage.y} width={stage.width} height={stage.height} rx={12} className="fill-foreground" />
        <text
          x={stage.x + stage.width / 2}
          y={stage.y + stage.height / 2 + 6}
          textAnchor="middle"
          className="fill-background text-[20px] font-bold tracking-[0.2em] sm:text-[14px]"
        >
          ESCENARIO
        </text>
      </g>

      {venue.zones.map((zone) => {
        const isSoldOut = zone.status === "sold-out";
        const isActive = zone.id === activeZoneId;
        const price = isSoldOut ? "Agotado" : formatEventPrice(zone.price, zone.currency);
        const textClass = isSoldOut ? "fill-zinc-500" : isDarkColor(zone.color) ? "fill-white" : "fill-indigo-950";

        return (
          <g
            key={zone.id}
            role="button"
            tabIndex={isSoldOut ? -1 : 0}
            aria-label={`${zone.name}, ${price}`}
            aria-pressed={isActive}
            aria-disabled={isSoldOut}
            onClick={isSoldOut ? undefined : () => onSelect(zone.id)}
            onKeyDown={isSoldOut ? undefined : (event) => handleKeyDown(event, zone)}
            className={cn("group outline-none", isSoldOut ? "cursor-not-allowed" : "cursor-pointer")}
          >
            <path
              d={zone.shape.path}
              fill={isSoldOut ? "url(#sold-out-hatch)" : zone.color}
              className={cn(
                "transition-[stroke,filter] duration-150 [stroke-linejoin:round]",
                isActive
                  ? "stroke-foreground [stroke-width:4]"
                  : "stroke-white [stroke-width:3] group-hover:stroke-foreground/70 group-focus-visible:stroke-indigo-500 group-focus-visible:[stroke-width:5]",
                !isSoldOut && "group-hover:brightness-95",
              )}
            />
            <text
              x={zone.shape.labelX}
              y={zone.shape.labelY - 5}
              textAnchor="middle"
              className={cn("pointer-events-none text-[22px] font-semibold sm:text-[15px]", textClass)}
            >
              {zone.shortName}
            </text>
            <text
              x={zone.shape.labelX}
              y={zone.shape.labelY + 18}
              textAnchor="middle"
              className={cn("pointer-events-none text-[20px] sm:text-[13px]", textClass)}
            >
              {price}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
