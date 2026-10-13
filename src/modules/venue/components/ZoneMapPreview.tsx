import { cn } from "@/lib/utils";
import { DEFAULT_ZONE_COLOR, VENUE_STAGE, VENUE_VIEWBOX } from "@/modules/booking/venue-map.utils";
import type { ZoneForEdit } from "@/modules/venue/venue.types";

interface ZoneMapPreviewProps {
  zones: Pick<ZoneForEdit, "id" | "name" | "color" | "shape">[];
  className?: string;
}

const MAX_LABEL_LENGTH = 22;

const hasShape = (zone: ZoneMapPreviewProps["zones"][number]): zone is typeof zone & { shape: NonNullable<typeof zone.shape> } =>
  zone.shape !== null && zone.shape.path !== "";

const shortLabel = (name: string) => (name.length > MAX_LABEL_LENGTH ? `${name.slice(0, MAX_LABEL_LENGTH - 1)}…` : name);

/**
 * Bird's-eye preview of the venue map (same viewBox as the public map): the
 * stage and every zone that has a shape, filled with its color and labelled
 * with its name, so color is never the only signal. Zones without a shape are
 * left out here and listed under the map.
 */
export function ZoneMapPreview({ zones, className }: ZoneMapPreviewProps) {
  const drawn = zones.filter(hasShape);
  const undrawn = zones.filter((zone) => !hasShape(zone));

  const label =
    drawn.length === 0
      ? "Mapa del recinto sin zonas dibujadas"
      : `Mapa del recinto con ${drawn.length} ${drawn.length === 1 ? "zona" : "zonas"}: ${drawn.map((zone) => zone.name).join(", ")}`;

  return (
    <figure className={cn("flex flex-col gap-3", className)}>
      <svg
        viewBox={VENUE_VIEWBOX}
        role="img"
        aria-label={label}
        className="block h-auto w-full rounded-2xl border border-border bg-zinc-100"
      >
        <rect x={VENUE_STAGE.x} y={VENUE_STAGE.y} width={VENUE_STAGE.width} height={VENUE_STAGE.height} rx={12} className="fill-foreground" />
        <text
          x={VENUE_STAGE.x + VENUE_STAGE.width / 2}
          y={VENUE_STAGE.y + VENUE_STAGE.height / 2 + 5}
          textAnchor="middle"
          className="fill-background text-[14px] font-bold tracking-[0.2em]"
        >
          ESCENARIO
        </text>

        {drawn.map((zone) => (
          <g key={zone.id}>
            <title>{zone.name}</title>
            <path
              d={zone.shape.path}
              fill={zone.color ?? DEFAULT_ZONE_COLOR}
              fillOpacity={0.9}
              className="stroke-white [stroke-linejoin:round] [stroke-width:3]"
            />
            <text
              x={zone.shape.labelX}
              y={zone.shape.labelY + 5}
              textAnchor="middle"
              className="pointer-events-none fill-zinc-950 stroke-white text-[15px] font-semibold [paint-order:stroke] [stroke-linejoin:round] [stroke-width:4]"
            >
              {shortLabel(zone.name)}
            </text>
          </g>
        ))}
      </svg>
      {undrawn.length > 0 && (
        <figcaption className="text-[13px] text-muted-foreground">
          Sin forma en el mapa: {undrawn.map((zone) => zone.name).join(", ")}.
        </figcaption>
      )}
    </figure>
  );
}
