import Image from "next/image";
import Link from "next/link";

import { formatEventDateParts, formatEventPrice } from "@/modules/event/event.utils";
import type { Event } from "@/modules/event/event.types";
import type { OrderLine } from "@/modules/booking/booking.types";

export type CheckoutEvent = Pick<Event, "id" | "title" | "date" | "venue" | "city" | "imageUrl" | "currency">;

interface CheckoutSummaryProps {
  event: CheckoutEvent;
  lines: OrderLine[];
}

/** Event header of the summary: thumbnail, title, date and venue. */
export function CheckoutEventHeader({ event, size }: { event: CheckoutEvent; size: "sm" | "lg" }) {
  return (
    <span className="flex min-w-0 items-center gap-3 lg:gap-3.5">
      <span
        className={
          size === "lg"
            ? "relative size-16 shrink-0 overflow-hidden rounded-2xl"
            : "relative size-12 shrink-0 overflow-hidden rounded-xl"
        }
      >
        <Image src={event.imageUrl} alt="" fill sizes="64px" className="object-cover" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[15px] font-semibold lg:text-base">{event.title}</span>
        <span className="truncate text-[13px] text-muted-foreground">
          {formatEventDateParts(event.date).short} · {event.venue}, {event.city}
        </span>
      </span>
    </span>
  );
}

/** Order lines (with seats) and the link back to the ticket step. */
export function CheckoutSummary({ event, lines }: CheckoutSummaryProps) {
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {lines.map((line) => (
          <li key={line.zoneId} className="flex flex-col gap-0.5 text-[15px]">
            <span className="flex justify-between gap-3">
              <span>
                {line.quantity} × {line.zoneName}
              </span>
              <span className="font-semibold tabular-nums">{formatEventPrice(line.amount, event.currency)}</span>
            </span>
            {line.seats.length > 0 && (
              <span className="text-[13px] text-muted-foreground">
                Asientos {line.seats.map((seat) => `${seat.row}${seat.number}`).join(", ")}
              </span>
            )}
          </li>
        ))}
      </ul>
      <Link
        href={`/events/${event.id}/tickets`}
        className="w-fit rounded-md text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Cambiar entradas
      </Link>
    </div>
  );
}
