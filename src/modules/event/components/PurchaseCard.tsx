import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { TicketTierList } from "@/modules/event/components/TicketTierList";
import { formatEventPrice } from "@/modules/event/event.utils";
import type { Event } from "@/modules/event/event.types";
import type { Zone } from "@/modules/booking/booking.types";

interface PurchaseCardProps {
  event: Pick<Event, "id" | "priceFrom" | "currency" | "status">;
  zones: Zone[];
}

function BuyButton({ event, label, className }: { event: PurchaseCardProps["event"]; label: string; className: string }) {
  if (event.status === "sold-out") {
    return (
      <span className={cn("flex items-center justify-center bg-muted font-semibold text-muted-foreground", className)}>
        Agotado
      </span>
    );
  }

  return (
    <Link
      href={`/events/${event.id}/tickets`}
      className={cn(buttonVariants({ variant: "cta" }), "cursor-pointer gap-2 font-semibold", className)}
    >
      {label}
      <ArrowRight className="size-[18px]" aria-hidden="true" />
    </Link>
  );
}

/**
 * Buy entry point: a sticky side card from `lg` and a bar fixed to the bottom
 * of the screen below it. The page must leave room for the bar (`pb-28`).
 */
export function PurchaseCard({ event, zones }: PurchaseCardProps) {
  const price = formatEventPrice(event.priceFrom, event.currency);

  return (
    <>
      <aside
        aria-label="Entradas"
        className="sticky top-24 hidden flex-col gap-5 rounded-3xl border border-border bg-card p-7 shadow-[0_20px_40px_-28px_rgba(24,24,27,0.35)] lg:flex"
      >
        <div className="flex flex-col gap-0.5">
          <span className="text-[13px] text-muted-foreground">Entradas desde</span>
          <span className="text-[30px] font-bold tracking-tight text-orange-700">{price}</span>
        </div>
        <TicketTierList zones={zones} className="border-t border-zinc-100" />
        <BuyButton event={event} label="Elegir entradas" className="h-14 rounded-2xl text-base" />
        <p className="flex items-center justify-center gap-2 text-[13px] text-muted-foreground">
          <Lock className="size-3.5" aria-hidden="true" />
          Pago seguro · Entrada digital con QR
        </p>
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-3 border-t border-border bg-background px-4 pt-3 pb-5 shadow-[0_-12px_24px_-18px_rgba(24,24,27,0.35)] lg:hidden">
        <span className="flex flex-col">
          <span className="text-xs text-muted-foreground">Desde</span>
          <span className="text-[22px] font-bold tracking-tight text-orange-700">{price}</span>
        </span>
        <BuyButton event={event} label="Comprar entradas" className="h-[52px] rounded-[15px] px-[22px] text-[15px]" />
      </div>
    </>
  );
}
