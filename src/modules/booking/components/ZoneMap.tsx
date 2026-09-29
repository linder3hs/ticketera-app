import { cn } from "@/lib/utils";
import { formatEventPrice } from "@/modules/event/event.utils";
import type { Zone } from "@/modules/booking/booking.types";

interface ZoneMapProps {
  zones: Zone[];
  activeZoneId: string | null;
  onSelect: (zoneId: string) => void;
}

/** Where each zone of the mock stadium sits in the 3×4 grid. */
const ZONE_AREAS: Record<string, string> = {
  vip: "col-start-2 row-start-2",
  general: "col-start-2 row-start-3",
  occidente: "col-start-1 row-start-1 row-span-3",
  oriente: "col-start-3 row-start-1 row-span-3",
  norte: "col-span-3 row-start-4 flex-row gap-2 lg:gap-2.5",
};

/** Side stands are too narrow on phones for the full name. */
const NARROW_ZONES = new Set(["occidente", "oriente"]);

/** True when white text reads better than dark text on `hex`. */
function isDarkColor(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}

/**
 * Bird's-eye stadium plan with the stage on top. Each zone is a toggle
 * button; sold-out zones are disabled.
 */
export function ZoneMap({ zones, activeZoneId, onSelect }: ZoneMapProps) {
  return (
    <div className="grid grid-cols-[76px_minmax(0,1fr)_76px] grid-rows-[34px_76px_96px_56px] gap-2 rounded-2xl bg-zinc-50 p-3 lg:grid-cols-[140px_minmax(0,1fr)_140px] lg:grid-rows-[44px_104px_128px_72px] lg:gap-2.5 lg:rounded-[18px] lg:p-5">
      <span className="col-start-2 row-start-1 flex items-center justify-center rounded-[10px] bg-foreground text-[10px] font-bold tracking-[0.16em] text-background lg:rounded-xl lg:text-xs">
        ESCENARIO
      </span>

      {zones.map((zone) => {
        const isSoldOut = zone.status === "sold-out";
        const isActive = zone.id === activeZoneId;
        const priceLabel = isSoldOut ? "Agotado" : formatEventPrice(zone.price, zone.currency);
        const isNarrow = NARROW_ZONES.has(zone.id);

        return (
          <button
            key={zone.id}
            type="button"
            aria-pressed={isActive}
            aria-label={`${zone.name}, ${priceLabel}`}
            disabled={isSoldOut}
            onClick={() => onSelect(zone.id)}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border-3 text-center transition-shadow focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-indigo-400 disabled:cursor-not-allowed lg:rounded-[14px]",
              ZONE_AREAS[zone.id],
              isActive ? "border-foreground shadow-md" : "border-transparent hover:shadow-md",
              isSoldOut ? "bg-zinc-200 text-zinc-600" : isDarkColor(zone.color) ? "text-white" : "text-indigo-950",
            )}
            style={isSoldOut ? undefined : { background: zone.color }}
          >
            <span className="px-1 text-xs leading-tight font-semibold lg:text-[15px]">
              {isNarrow ? (
                <>
                  <span className="lg:hidden">{zone.shortName}</span>
                  <span className="hidden lg:inline">{zone.name}</span>
                </>
              ) : (
                zone.name
              )}
            </span>
            <span className="text-[11px] lg:text-[13px]">{priceLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
