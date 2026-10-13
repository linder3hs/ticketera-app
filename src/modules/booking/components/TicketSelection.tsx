"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { EventCover } from "@/modules/event/components/EventCover";
import { formatEventDateParts } from "@/modules/event/event.utils";
import type { Event } from "@/modules/event/event.types";
import { usePersistHydration } from "@/lib/use-persist-hydration";
import { reserveTicketsAction } from "@/modules/booking/actions";
import { getOrderLines, getOrderTotals, useBookingStore } from "@/modules/booking/booking.store";
import type { Seat, VenueMap } from "@/modules/booking/booking.types";
import { toReserveInput } from "@/modules/booking/reservation.utils";
import { OrderSummary } from "@/modules/booking/components/OrderSummary";
import { VenueExplorer } from "@/modules/booking/components/VenueExplorer";

interface TicketSelectionProps {
  event: Pick<Event, "id" | "slug" | "title" | "date" | "venue" | "city" | "imageUrl" | "currency">;
  venue: VenueMap;
}

const NO_SEATS: Record<string, Seat[]> = {};
const NO_QUANTITIES: Record<string, number> = {};

/**
 * Ticket picking step: venue map (zones, then seats or quantity) and summary.
 * "Continuar" holds the selection on the server and opens the checkout; if
 * some tickets were taken, it drops them, says so and reloads the map.
 */
export function TicketSelection({ event, venue }: TicketSelectionProps) {
  const { zones } = venue;
  const router = useRouter();
  const store = useBookingStore();
  const hydrated = usePersistHydration(useBookingStore);
  // Until `init` runs, the store may still hold another event's selection.
  const isCurrent = hydrated && store.eventId === event.id;
  const seats = isCurrent ? store.seats : NO_SEATS;
  const quantities = isCurrent ? store.quantities : NO_QUANTITIES;
  const activeZoneId = isCurrent ? store.activeZoneId : null;
  const { init, pruneSelection } = store;
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Writing before the saved selection loads would overwrite it.
    if (hydrated) init(event.id, null);
  }, [hydrated, init, event.id]);

  const lines = useMemo(() => getOrderLines(zones, { seats, quantities }), [zones, seats, quantities]);
  const { count, total } = getOrderTotals(lines);
  const counts = Object.fromEntries(lines.map((line) => [line.zoneId, line.quantity]));

  function handleContinue() {
    setError(null);
    startTransition(async () => {
      const result = await reserveTicketsAction(toReserveInput(event.slug, lines));
      if (result.ok) {
        // Inside the transition, so "Reservando…" lasts until the checkout opens.
        startTransition(() => router.push(`/events/${event.slug}/checkout`));
        return;
      }
      setError(result.error);
      if (result.unavailable) pruneSelection(result.unavailable);
      router.refresh();
    });
  }

  const date = formatEventDateParts(event.date);

  return (
    <>
      <div className="border-b border-zinc-100 bg-background lg:border-0 lg:bg-transparent">
        <div className="mx-auto hidden max-w-7xl px-6 pt-6 lg:block">
          <Link
            href={`/events/${event.slug}`}
            className="flex h-8 w-fit items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Volver al evento
          </Link>
        </div>
        <div className="mx-auto flex max-w-7xl items-center gap-3 p-4 md:px-6 lg:gap-4 lg:pt-4 lg:pb-7">
          <div className="relative size-[52px] shrink-0 overflow-hidden rounded-[14px] lg:size-16 lg:rounded-2xl">
            <EventCover src={event.imageUrl} alt="" sizes="64px" />
          </div>
          <div className="flex min-w-0 flex-col gap-px lg:gap-0.5">
            <h1 className="truncate text-[15px] font-semibold lg:text-[26px] lg:leading-tight lg:font-bold lg:tracking-tight">
              {event.title}
            </h1>
            <p className="truncate text-[13px] text-muted-foreground lg:text-[15px]">
              <span className="lg:hidden">{date.short}</span>
              <span className="hidden lg:inline">{date.long}</span> · {event.venue}, {event.city}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-4 p-4 md:px-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-8 lg:pt-0 lg:pb-20">
        <VenueExplorer
          venue={venue}
          activeZoneId={activeZoneId}
          seats={seats}
          quantities={quantities}
          counts={counts}
          onSelectZone={store.setActiveZone}
          onToggleSeat={store.toggleSeat}
          onChangeQuantity={store.setQuantity}
        />

        <OrderSummary
          lines={lines}
          count={count}
          total={total}
          currency={event.currency}
          onRemoveSeat={store.removeSeat}
          onContinue={handleContinue}
          isPending={isPending}
          error={error}
        />
      </div>
    </>
  );
}
