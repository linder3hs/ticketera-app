"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import {
  MiniMap,
  TransformComponent,
  TransformWrapper,
  useControls,
  type ReactZoomPanPinchRef,
} from "react-zoom-pan-pinch";

import { cn } from "@/lib/utils";
import { formatEventPrice } from "@/modules/event/event.utils";
import { getFirstFreeSeatId, getNextSeatId, type SeatDirection } from "@/modules/booking/seat-navigation";
import type { Seat, Zone } from "@/modules/booking/booking.types";

interface SeatMapProps {
  zone: Zone;
  selectedSeatIds: ReadonlySet<string>;
  /** The zone reached its ticket limit: only selected seats stay clickable. */
  isFull: boolean;
  onToggleSeat: (seat: Seat) => void;
}

/** Half the seat's width; seats are 28 units apart. */
const HALF = 10;
/** Room around the seats for the row labels and the stage marker. */
const PADDING = { x: 52, top: 84, bottom: 28 };
/** A drag longer than this (in px) is a pan, not a seat click. */
const DRAG_THRESHOLD = 4;
/** Smallest initial zoom: below it seats are too small to tap. */
const MIN_INITIAL_SCALE = 0.85;

const ARROW_KEYS: Record<string, SeatDirection> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

const CONTROL_CLASS =
  "flex size-11 cursor-pointer items-center justify-center text-foreground hover:bg-muted focus-visible:relative focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function ZoomControls({ onReset }: { onReset: () => void }) {
  const { zoomIn, zoomOut } = useControls();

  return (
    <div className="absolute right-3 bottom-3 z-10 flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-background shadow-md">
      <button type="button" aria-label="Acercar" className={CONTROL_CLASS} onClick={() => zoomIn(0.4)}>
        <Plus className="size-5" aria-hidden="true" />
      </button>
      <button type="button" aria-label="Alejar" className={CONTROL_CLASS} onClick={() => zoomOut(0.4)}>
        <Minus className="size-5" aria-hidden="true" />
      </button>
      <button type="button" aria-label="Restablecer vista" className={CONTROL_CLASS} onClick={onReset}>
        <RotateCcw className="size-[18px]" aria-hidden="true" />
      </button>
    </div>
  );
}

function getBounds(zone: Zone) {
  const seats = (zone.rows ?? []).flatMap((row) => row.seats);
  const xs = seats.map((seat) => seat.x);
  const ys = seats.map((seat) => seat.y);
  const minX = Math.min(...xs) - HALF - PADDING.x;
  const minY = Math.min(...ys) - HALF - PADDING.top;
  const width = Math.max(...xs) + HALF + PADDING.x - minX;
  const height = Math.max(...ys) + HALF + PADDING.bottom - minY;
  return { minX, minY, width, height };
}

/** Chair outline centered on (x, y): a backrest over a rounded seat. */
function chairPath(x: number, y: number) {
  return (
    `M${x - 9} ${y - 3}v-4a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v4` +
    `M${x - 10} ${y - 1}h20v6a4 4 0 0 1-4 4h-12a4 4 0 0 1-4-4z`
  );
}

type SeatState = "free" | "selected" | "occupied" | "blocked";

function seatClasses(state: SeatState) {
  return {
    free: "fill-[var(--zone)] stroke-indigo-900/35 group-hover:stroke-indigo-900 group-hover:[stroke-width:2]",
    selected: "fill-indigo-900 stroke-indigo-900",
    occupied: "fill-zinc-200 stroke-zinc-200",
    blocked: "fill-[var(--zone)] stroke-transparent opacity-35",
  }[state];
}

/** Seats drawn as chairs; `interactive` adds focus, keys and handlers. */
function SeatLayer({
  zone,
  getState,
  interactive,
}: {
  zone: Zone;
  getState: (seat: Seat) => SeatState;
  interactive?: {
    focusId: string | null;
    price: string;
    hoveredRow: string | null;
    onSeatClick: (seat: Seat) => void;
    onSeatKeyDown: (event: KeyboardEvent, seat: Seat) => void;
    onSeatEnter: (seat: Seat, element: Element) => void;
    onSeatLeave: () => void;
  };
}) {
  const rows = zone.rows ?? [];
  const bounds = getBounds(zone);
  const firstSeatY = Math.min(...rows.flatMap((row) => row.seats.map((seat) => seat.y)));

  return (
    <svg
      width={bounds.width}
      height={bounds.height}
      viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
      className="block select-none"
      style={{ ["--zone" as string]: zone.color }}
      {...(interactive
        ? { role: "group", "aria-label": `Asientos de ${zone.name}` }
        : { "aria-hidden": true })}
    >
      <g aria-hidden="true">
        <rect
          x={bounds.minX + bounds.width * 0.22}
          y={bounds.minY + 14}
          width={bounds.width * 0.56}
          height={34}
          rx={17}
          className="fill-foreground"
        />
        <text
          x={bounds.minX + bounds.width / 2}
          y={bounds.minY + 36}
          textAnchor="middle"
          className="fill-background text-[12px] font-bold tracking-[0.18em]"
        >
          ESCENARIO
        </text>
        <line
          x1={bounds.minX + 28}
          x2={bounds.minX + bounds.width - 28}
          y1={firstSeatY - 30}
          y2={firstSeatY - 30}
          className="stroke-zinc-300 [stroke-dasharray:3_6] [stroke-width:1.5]"
        />
      </g>

      {rows.map((row) => {
        const first = row.seats[0];
        const last = row.seats[row.seats.length - 1];
        const isHovered = interactive?.hoveredRow === row.label;
        return (
          <g key={row.label}>
            {isHovered && (
              <path
                d={`M${first.x - 16} ${first.y - 15} ${row.seats.map((seat) => `L${seat.x} ${seat.y - 15}`).join(" ")} L${last.x + 16} ${last.y - 15} L${last.x + 16} ${last.y + 13} ${[...row.seats].reverse().map((seat) => `L${seat.x} ${seat.y + 13}`).join(" ")} L${first.x - 16} ${first.y + 13} Z`}
                aria-hidden="true"
                className="fill-indigo-100"
              />
            )}
            {interactive &&
              [
                [first.x - 32, first.y],
                [last.x + 32, last.y],
              ].map(([x, y]) => (
                <text
                  key={x}
                  x={x}
                  y={y + 4}
                  textAnchor="middle"
                  aria-hidden="true"
                  className={cn("text-[12px] font-semibold", isHovered ? "fill-indigo-900" : "fill-muted-foreground")}
                >
                  {row.label}
                </text>
              ))}

            {row.seats.map((seat) => {
              const state = getState(seat);
              const path = chairPath(seat.x, seat.y);
              if (!interactive) return <path key={seat.id} d={path} className={seatClasses(state)} />;

              const isSelected = state === "selected";
              const isDisabled = state === "occupied" || state === "blocked";
              return (
                <g
                  key={seat.id}
                  id={`seat-${seat.id}`}
                  role="checkbox"
                  aria-checked={isSelected}
                  aria-disabled={isDisabled}
                  aria-label={`Fila ${seat.row}, asiento ${seat.number}, ${interactive.price}${state === "occupied" ? ", ocupado" : ""}`}
                  tabIndex={seat.id === interactive.focusId ? 0 : -1}
                  onClick={isDisabled ? undefined : () => interactive.onSeatClick(seat)}
                  onKeyDown={(event) => interactive.onSeatKeyDown(event, seat)}
                  onMouseEnter={(event) => interactive.onSeatEnter(seat, event.currentTarget)}
                  onFocus={(event) => interactive.onSeatEnter(seat, event.currentTarget)}
                  onMouseLeave={interactive.onSeatLeave}
                  onBlur={interactive.onSeatLeave}
                  className={cn(
                    "group outline-none",
                    isDisabled ? "cursor-not-allowed" : "cursor-pointer",
                  )}
                >
                  {/* Invisible hit area: the chair outline alone is fiddly to tap. */}
                  <rect x={seat.x - 13} y={seat.y - 13} width={26} height={26} fill="transparent" />
                  <rect
                    x={seat.x - 13}
                    y={seat.y - 14}
                    width={26}
                    height={28}
                    rx={7}
                    className="fill-none stroke-transparent [stroke-width:3] group-focus-visible:stroke-indigo-500"
                  />
                  <path d={path} className={cn("transition-colors [stroke-width:1.25]", seatClasses(state))} />
                  {isSelected && (
                    <path
                      d={`M${seat.x - 4} ${seat.y + 3}l3 3 5-5.5`}
                      fill="none"
                      className="pointer-events-none stroke-white [stroke-width:2.25]"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Numbered seats of one zone, drawn as chairs, with zoom and pan (wheel and
 * drag on desktop, pinch on touch), a minimap, a tooltip and row highlight
 * on hover or focus. The map is a single tab stop: arrow keys move between
 * free seats and Enter/Space toggles one.
 */
export function SeatMap({ zone, selectedSeatIds, isFull, onToggleSeat }: SeatMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const transformRef = useRef<ReactZoomPanPinchRef>(null);
  const panStart = useRef({ x: 0, y: 0 });
  const wasDragged = useRef(false);
  const initialScale = useRef(1);
  const [focusId, setFocusId] = useState(() => getFirstFreeSeatId(zone.rows ?? []));
  const [hovered, setHovered] = useState<{ seat: Seat; left: number; top: number } | null>(null);

  const rows = zone.rows ?? [];
  const bounds = getBounds(zone);
  const price = formatEventPrice(zone.price, zone.currency);

  const getState = (seat: Seat): SeatState => {
    if (seat.status === "occupied") return "occupied";
    if (selectedSeatIds.has(seat.id)) return "selected";
    return isFull ? "blocked" : "free";
  };

  function showTooltip(seat: Seat, element: Element) {
    const box = containerRef.current?.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    if (!box) return;
    setHovered({ seat, left: rect.left + rect.width / 2 - box.left, top: rect.top - box.top });
  }

  function handleSeatClick(seat: Seat) {
    // Releasing a pan over a seat fires a click: ignore it.
    if (wasDragged.current) return;
    setFocusId(seat.id);
    onToggleSeat(seat);
  }

  function handleSeatKeyDown(event: KeyboardEvent, seat: Seat) {
    const direction = ARROW_KEYS[event.key];
    if (direction) {
      event.preventDefault();
      const nextId = getNextSeatId(rows, seat.id, direction);
      const next = nextId && document.getElementById(`seat-${nextId}`);
      if (!next) return;
      setFocusId(nextId);
      (next as unknown as HTMLElement).focus({ preventScroll: true });
      // Bring the seat into view when it's outside the visible area.
      const box = containerRef.current?.getBoundingClientRect();
      const rect = next.getBoundingClientRect();
      if (box && (rect.left < box.left || rect.right > box.right || rect.top < box.top || rect.bottom > box.bottom)) {
        transformRef.current?.zoomToElement(next as HTMLElement, transformRef.current.state.scale, 200);
      }
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (getState(seat) === "free" || getState(seat) === "selected") onToggleSeat(seat);
    }
  }

  function centerOnZone(ref: ReactZoomPanPinchRef, animationTime: number) {
    ref.centerView(initialScale.current, animationTime, "easeOutCubic");
  }

  const hoveredState = hovered && getState(hovered.seat);

  return (
    <div
      ref={containerRef}
      className="relative h-[380px] overflow-hidden rounded-2xl border border-border bg-[radial-gradient(circle,var(--color-zinc-200)_1px,transparent_1px)] bg-zinc-50 [background-size:18px_18px] lg:h-[460px]"
    >
      <TransformWrapper
        key={zone.id}
        ref={transformRef}
        minScale={0.3}
        maxScale={4}
        doubleClick={{ disabled: true }}
        onInit={(ref) => {
          // Fit the stand, but never shrink seats below a tappable size.
          const wrapper = ref.instance.wrapperComponent;
          if (!wrapper) return;
          const fit = Math.min(wrapper.clientWidth / bounds.width, wrapper.clientHeight / bounds.height, 1.2);
          initialScale.current = Math.max(fit, MIN_INITIAL_SCALE);
          // Start zoomed out and ease in: the "fly into the zone" effect.
          ref.centerView(initialScale.current * 0.6, 0);
          centerOnZone(ref, 450);
        }}
        onPanningStart={(ref) => {
          panStart.current = { x: ref.state.positionX, y: ref.state.positionY };
          wasDragged.current = false;
        }}
        onPanning={(ref) => {
          const moved = Math.hypot(ref.state.positionX - panStart.current.x, ref.state.positionY - panStart.current.y);
          if (moved > DRAG_THRESHOLD) {
            wasDragged.current = true;
            setHovered(null);
          }
        }}
        onZoom={() => setHovered(null)}
      >
        <ZoomControls onReset={() => transformRef.current && centerOnZone(transformRef.current, 300)} />
        <div className="absolute bottom-3 left-3 z-10 hidden overflow-hidden rounded-lg border border-border bg-background/90 p-1 shadow-sm sm:block">
          <MiniMap width={120} borderColor="#4F46E5" previewStyle={{ borderWidth: 2 }}>
            <SeatLayer zone={zone} getState={getState} />
          </MiniMap>
        </div>
        <TransformComponent wrapperClass="!size-full" contentClass="!size-fit">
          <SeatLayer
            zone={zone}
            getState={getState}
            interactive={{
              focusId,
              price,
              hoveredRow: hovered?.seat.row ?? null,
              onSeatClick: handleSeatClick,
              onSeatKeyDown: handleSeatKeyDown,
              onSeatEnter: showTooltip,
              onSeatLeave: () => setHovered(null),
            }}
          />
        </TransformComponent>
      </TransformWrapper>

      {hovered && (
        <div
          role="presentation"
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-xl bg-foreground px-3 py-2 text-xs whitespace-nowrap text-background shadow-lg"
          style={{ left: hovered.left, top: hovered.top - 8 }}
        >
          <span className="block font-semibold">
            Fila {hovered.seat.row} · Asiento {hovered.seat.number}
          </span>
          <span className="text-zinc-300">
            {hoveredState === "occupied"
              ? "Ocupado"
              : hoveredState === "blocked"
                ? "Llegaste al máximo de la zona"
                : `${price}${hoveredState === "selected" ? " · Seleccionado" : ""}`}
          </span>
        </div>
      )}
    </div>
  );
}

/** Key of the seat states, drawn like the seats themselves. */
export function SeatLegend({ zoneColor }: { zoneColor: string }) {
  const items: { label: string; state: SeatState }[] = [
    { label: "Disponible", state: "free" },
    { label: "Seleccionado", state: "selected" },
    { label: "Ocupado", state: "occupied" },
  ];

  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <svg viewBox="-12 -12 24 24" className="size-5" aria-hidden="true" style={{ ["--zone" as string]: zoneColor }}>
            <path d={chairPath(0, 0)} className={cn("[stroke-width:1.25]", seatClasses(item.state))} />
            {item.state === "selected" && (
              <path d="M-4 3l3 3 5-5.5" fill="none" className="stroke-white [stroke-width:2.25]" strokeLinecap="round" />
            )}
          </svg>
          {item.label}
        </li>
      ))}
    </ul>
  );
}
