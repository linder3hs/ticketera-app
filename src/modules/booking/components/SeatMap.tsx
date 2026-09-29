"use client";

import { useRef, type KeyboardEvent } from "react";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { TransformComponent, TransformWrapper, useControls } from "react-zoom-pan-pinch";

import { cn } from "@/lib/utils";
import { formatEventPrice } from "@/modules/event/event.utils";
import type { Seat, Zone } from "@/modules/booking/booking.types";

interface SeatMapProps {
  zone: Zone;
  selectedSeatIds: ReadonlySet<string>;
  /** The zone reached its ticket limit: only selected seats stay clickable. */
  isFull: boolean;
  onToggleSeat: (seat: Seat) => void;
}

const SEAT_RADIUS = 11;
/** Room around the seats for the row labels and the stage marker. */
const PADDING = { x: 44, top: 72, bottom: 24 };
/** A drag longer than this (in px) is a pan, not a seat click. */
const DRAG_THRESHOLD = 4;
/** Smallest initial zoom: below it seats are too small to tap. */
const MIN_INITIAL_SCALE = 0.85;

const CONTROL_CLASS =
  "flex size-11 cursor-pointer items-center justify-center rounded-xl border border-border bg-background text-foreground shadow-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function ZoomControls({ getInitialScale }: { getInitialScale: () => number }) {
  const { zoomIn, zoomOut, centerView } = useControls();

  return (
    <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
      <button type="button" aria-label="Acercar" className={CONTROL_CLASS} onClick={() => zoomIn()}>
        <Plus className="size-5" aria-hidden="true" />
      </button>
      <button type="button" aria-label="Alejar" className={CONTROL_CLASS} onClick={() => zoomOut()}>
        <Minus className="size-5" aria-hidden="true" />
      </button>
      <button type="button" aria-label="Restablecer vista" className={CONTROL_CLASS} onClick={() => centerView(getInitialScale())}>
        <RotateCcw className="size-5" aria-hidden="true" />
      </button>
    </div>
  );
}

function getBounds(zone: Zone) {
  const seats = (zone.rows ?? []).flatMap((row) => row.seats);
  const xs = seats.map((seat) => seat.x);
  const ys = seats.map((seat) => seat.y);
  const minX = Math.min(...xs) - SEAT_RADIUS - PADDING.x;
  const minY = Math.min(...ys) - SEAT_RADIUS - PADDING.top;
  const maxX = Math.max(...xs) + SEAT_RADIUS + PADDING.x;
  const maxY = Math.max(...ys) + SEAT_RADIUS + PADDING.bottom;
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Numbered seats of one zone as an SVG, with wheel/drag zoom and pan on
 * desktop and pinch/drag on touch screens. Every seat is a focusable
 * checkbox (Enter/Space toggles it); states differ in lightness and shape,
 * not only hue.
 */
export function SeatMap({ zone, selectedSeatIds, isFull, onToggleSeat }: SeatMapProps) {
  const panStart = useRef({ x: 0, y: 0 });
  const wasDragged = useRef(false);
  const initialScale = useRef(1);

  const rows = zone.rows ?? [];
  const bounds = getBounds(zone);
  const price = formatEventPrice(zone.price, zone.currency);
  const firstSeatY = Math.min(...rows.flatMap((row) => row.seats.map((seat) => seat.y)));

  function handleClick(seat: Seat) {
    // Releasing a pan over a seat fires a click: ignore it.
    if (wasDragged.current) return;
    onToggleSeat(seat);
  }

  function handleKeyDown(event: KeyboardEvent, seat: Seat) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onToggleSeat(seat);
  }

  return (
    <div className="relative h-[360px] overflow-hidden rounded-2xl border border-border bg-zinc-50 lg:h-[440px]">
      <TransformWrapper
        key={zone.id}
        minScale={0.3}
        maxScale={4}
        doubleClick={{ disabled: true }}
        onInit={(ref) => {
          // Fit the stand in the box, but on narrow screens never shrink seats
          // below a tappable size: users pan to the rest.
          const wrapper = ref.instance.wrapperComponent;
          if (!wrapper) return;
          const fit = Math.min(wrapper.clientWidth / bounds.width, wrapper.clientHeight / bounds.height, 1);
          initialScale.current = Math.max(fit, MIN_INITIAL_SCALE);
          ref.centerView(initialScale.current, 0);
        }}
        onPanningStart={(ref) => {
          panStart.current = { x: ref.state.positionX, y: ref.state.positionY };
          wasDragged.current = false;
        }}
        onPanning={(ref) => {
          const dx = ref.state.positionX - panStart.current.x;
          const dy = ref.state.positionY - panStart.current.y;
          if (Math.hypot(dx, dy) > DRAG_THRESHOLD) wasDragged.current = true;
        }}
      >
        <ZoomControls getInitialScale={() => initialScale.current} />
        <TransformComponent wrapperClass="!size-full" contentClass="!size-fit">
          <svg
            width={bounds.width}
            height={bounds.height}
            viewBox={`${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`}
            role="group"
            aria-label={`Asientos de ${zone.name}`}
            className="block touch-none select-none"
          >
            <g aria-hidden="true">
              <rect
                x={bounds.minX + bounds.width * 0.25}
                y={bounds.minY + 12}
                width={bounds.width * 0.5}
                height={28}
                rx={10}
                className="fill-foreground"
              />
              <text
                x={bounds.minX + bounds.width / 2}
                y={bounds.minY + 30}
                textAnchor="middle"
                className="fill-background text-[11px] font-bold tracking-[0.16em]"
              >
                HACIA EL ESCENARIO
              </text>
            </g>

            {rows.map((row) => {
              const firstSeat = row.seats[0];
              const lastSeat = row.seats[row.seats.length - 1];
              return (
                <g key={row.label}>
                  {[firstSeat.x - 30, lastSeat.x + 30].map((x) => (
                    <text
                      key={x}
                      x={x}
                      y={(x < firstSeat.x ? firstSeat.y : lastSeat.y) + 4}
                      textAnchor="middle"
                      aria-hidden="true"
                      className="fill-muted-foreground text-[12px] font-semibold"
                    >
                      {row.label}
                    </text>
                  ))}

                  {row.seats.map((seat) => {
                    const isOccupied = seat.status === "occupied";
                    const isSelected = selectedSeatIds.has(seat.id);
                    const isDisabled = isOccupied || (isFull && !isSelected);
                    const label = `Fila ${seat.row}, asiento ${seat.number}, ${price}${isOccupied ? ", ocupado" : ""}`;

                    return (
                      <g key={seat.id}>
                        <circle
                          cx={seat.x}
                          cy={seat.y}
                          r={SEAT_RADIUS}
                          role="checkbox"
                          aria-checked={isSelected}
                          aria-disabled={isDisabled}
                          aria-label={label}
                          tabIndex={isOccupied ? -1 : 0}
                          onClick={isDisabled ? undefined : () => handleClick(seat)}
                          onKeyDown={isDisabled ? undefined : (event) => handleKeyDown(event, seat)}
                          className={cn(
                            "outline-none focus-visible:stroke-indigo-400 focus-visible:[stroke-width:5]",
                            isOccupied && "fill-zinc-200",
                            isSelected && "cursor-pointer fill-primary stroke-primary [stroke-width:2]",
                            !isOccupied && !isSelected && "fill-white stroke-indigo-500 [stroke-width:2]",
                            !isOccupied && !isSelected && (isFull ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:fill-indigo-100"),
                          )}
                        >
                          <title>{label}</title>
                        </circle>
                        {isOccupied && (
                          <path
                            d={`M${seat.x - 4} ${seat.y - 4}l8 8m0-8l-8 8`}
                            aria-hidden="true"
                            className="pointer-events-none stroke-zinc-400 [stroke-width:2]"
                            strokeLinecap="round"
                          />
                        )}
                        {isSelected && (
                          <path
                            d={`M${seat.x - 4.5} ${seat.y}l3 3 6-6`}
                            aria-hidden="true"
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

            <line
              x1={bounds.minX + 24}
              x2={bounds.minX + bounds.width - 24}
              y1={firstSeatY - 34}
              y2={firstSeatY - 34}
              aria-hidden="true"
              className="stroke-zinc-200 [stroke-dasharray:4_6] [stroke-width:1.5]"
            />
          </svg>
        </TransformComponent>
      </TransformWrapper>
    </div>
  );
}

/** Key of the seat states, drawn like the seats themselves. */
export function SeatLegend() {
  const items = [
    { label: "Disponible", circle: "fill-white stroke-indigo-500", mark: null },
    { label: "Seleccionado", circle: "fill-primary stroke-primary", mark: "M7.5 12l3 3 6-6" },
    { label: "Ocupado", circle: "fill-zinc-200 stroke-zinc-200", mark: "M8 8l8 8m0-8l-8 8" },
  ];

  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
            <circle cx="12" cy="12" r="10" className={cn("[stroke-width:2]", item.circle)} />
            {item.mark && (
              <path
                d={item.mark}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={cn("[stroke-width:2]", item.label === "Ocupado" ? "stroke-zinc-400" : "stroke-white")}
              />
            )}
          </svg>
          {item.label}
        </li>
      ))}
    </ul>
  );
}
