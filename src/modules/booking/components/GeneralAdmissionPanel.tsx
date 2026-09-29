import { Minus, Plus, Users } from "lucide-react";

import { formatEventPrice } from "@/modules/event/event.utils";
import { MAX_TICKETS_PER_ZONE } from "@/modules/booking/booking.store";
import type { Zone } from "@/modules/booking/booking.types";

interface GeneralAdmissionPanelProps {
  zone: Zone;
  quantity: number;
  onChange: (quantity: number) => void;
}

const STEP_CLASS =
  "flex size-14 cursor-pointer items-center justify-center rounded-2xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40";

/** Quantity picker for a standing zone, with its per-ticket price and subtotal. */
export function GeneralAdmissionPanel({ zone, quantity, onChange }: GeneralAdmissionPanelProps) {
  return (
    <div className="flex flex-col items-center gap-5 rounded-2xl border border-border bg-zinc-50 px-5 py-7 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl text-white" style={{ background: zone.color }}>
        <Users className="size-6" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold">{zone.name} · De pie</h3>
        <p className="text-sm text-muted-foreground">
          {formatEventPrice(zone.price, zone.currency)} por entrada · sin asiento asignado
        </p>
      </div>

      <div className="flex items-center gap-4" role="group" aria-label={`Cantidad de entradas de ${zone.name}`}>
        <button
          type="button"
          aria-label={`Quitar una entrada de ${zone.name}`}
          disabled={quantity === 0}
          onClick={() => onChange(quantity - 1)}
          className={`${STEP_CLASS} border border-border bg-background`}
        >
          <Minus className="size-6" aria-hidden="true" />
        </button>
        <span aria-live="polite" className="w-16 text-4xl font-bold tabular-nums">
          {quantity}
        </span>
        <button
          type="button"
          aria-label={`Agregar una entrada de ${zone.name}`}
          disabled={quantity >= MAX_TICKETS_PER_ZONE}
          onClick={() => onChange(quantity + 1)}
          className={`${STEP_CLASS} bg-foreground text-background`}
        >
          <Plus className="size-6" aria-hidden="true" />
        </button>
      </div>

      <p className="text-sm">
        Subtotal{" "}
        <strong className="font-semibold tabular-nums">{formatEventPrice(quantity * zone.price, zone.currency)}</strong>
        <span className="block text-xs text-muted-foreground">Máximo {MAX_TICKETS_PER_ZONE} entradas por zona.</span>
      </p>
    </div>
  );
}
