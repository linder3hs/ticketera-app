import { ArrowRight, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatEventPrice } from "@/modules/event/event.utils";
import type { OrderLine } from "@/modules/booking/booking.store";

interface OrderSummaryProps {
  lines: OrderLine[];
  count: number;
  total: number;
  currency: string;
  onRemoveSeat: (zoneId: string, seatId: string) => void;
}

function ContinueButton({ isEmpty, className }: { isEmpty: boolean; className: string }) {
  // Visual only until the checkout step exists (next phase).
  return (
    <Button
      type="button"
      variant="cta"
      disabled={isEmpty}
      className={cn(
        "cursor-pointer gap-2 font-semibold disabled:bg-zinc-200 disabled:text-muted-foreground disabled:opacity-100",
        className,
      )}
    >
      Continuar
      {!isEmpty && <ArrowRight className="size-[18px]" aria-hidden="true" />}
    </Button>
  );
}

/**
 * "Tu compra": the lines, total and continue button. A sticky card beside the
 * map from `lg`; below it, the card sits in the flow and a bar fixed to the
 * bottom of the screen keeps total and button in reach (the page leaves room
 * for it).
 */
export function OrderSummary({ lines, count, total, currency, onRemoveSeat }: OrderSummaryProps) {
  const isEmpty = count === 0;
  const countLabel = count === 1 ? "1 entrada" : `${count} entradas`;
  const totalLabel = formatEventPrice(total, currency);

  return (
    <>
      <aside
        aria-label="Resumen de la compra"
        className="flex flex-col gap-5 rounded-[22px] border border-border bg-card p-5 lg:sticky lg:top-6 lg:rounded-3xl lg:p-7 lg:shadow-[0_20px_40px_-28px_rgba(24,24,27,0.35)]"
      >
        <h2 className="text-lg font-semibold lg:text-xl">Tu compra</h2>

        {isEmpty ? (
          <p className="rounded-2xl border-[1.5px] border-dashed border-zinc-300 p-5 text-center text-sm leading-normal text-muted-foreground">
            Todavía no elegiste entradas. Toca una zona del mapa o usa los botones +.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {lines.map((line) => (
              <li key={line.zoneId} className="flex flex-col gap-2">
                <span className="flex justify-between gap-3 text-[15px]">
                  <span>
                    {line.quantity} × {line.zoneName}
                  </span>
                  <span className="font-semibold tabular-nums">{formatEventPrice(line.amount, currency)}</span>
                </span>
                {line.seats.length > 0 && (
                  <ul aria-label={`Asientos en ${line.zoneName}`} className="flex flex-wrap gap-1.5">
                    {line.seats.map((seat) => (
                      <li key={seat.id}>
                        <button
                          type="button"
                          aria-label={`Quitar fila ${seat.row}, asiento ${seat.number}`}
                          onClick={() => onRemoveSeat(line.zoneId, seat.id)}
                          className="flex h-8 cursor-pointer items-center gap-1 rounded-full bg-indigo-50 pr-2 pl-3 text-[13px] font-medium text-indigo-900 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          {seat.row}
                          {seat.number}
                          <X className="size-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-baseline justify-between border-t-[1.5px] border-dashed border-zinc-300 pt-[18px]">
          <span className="text-[15px] font-medium">
            Total <span className="font-normal text-muted-foreground">({countLabel})</span>
          </span>
          <span aria-live="polite" className="text-[28px] font-bold tracking-tight tabular-nums">
            {totalLabel}
          </span>
        </div>

        <ContinueButton isEmpty={isEmpty} className="hidden h-14 rounded-2xl text-base lg:inline-flex" />
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-border bg-background px-4 pt-3 pb-5 shadow-[0_-12px_24px_-18px_rgba(24,24,27,0.35)] lg:hidden">
        <span className="flex flex-col">
          <span className="text-xs text-muted-foreground">Total · {countLabel}</span>
          <span className="text-[22px] font-bold tracking-tight tabular-nums">{totalLabel}</span>
        </span>
        <ContinueButton isEmpty={isEmpty} className="h-[52px] rounded-[15px] px-6 text-[15px]" />
      </div>
    </>
  );
}
