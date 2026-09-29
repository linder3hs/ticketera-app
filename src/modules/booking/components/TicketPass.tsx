import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { QrPattern } from "@/components/ui/qr-pattern";
import { formatEventDateParts } from "@/modules/event/event.utils";
import type { Event } from "@/modules/event/event.types";
import type { OrderTicket } from "@/modules/booking/ticket-export";


interface TicketPassProps {
  event: Pick<Event, "title" | "category" | "date" | "venue" | "city" | "imageUrl">;
  ticket: OrderTicket;
  index: number;
  count: number;
  totalLabel: string;
  onPrevious: () => void;
  onNext: () => void;
}

const NOTCH_CLASS = "absolute size-6 rounded-full border border-border bg-muted";
const NAV_CLASS =
  "flex size-11 cursor-pointer items-center justify-center rounded-xl border border-border bg-background hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40";

/**
 * One ticket: event data on the left (top on phones) and a perforated stub
 * with the QR, plus previous/next when the order has several tickets.
 */
export function TicketPass({ event, ticket, index, count, totalLabel, onPrevious, onNext }: TicketPassProps) {
  const details = [
    { label: "Zona", value: ticket.zoneName },
    ticket.seatLabel ? { label: "Asiento", value: ticket.seatLabel } : { label: "Entradas", value: String(count) },
    { label: "Total pagado", value: totalLabel },
  ];

  return (
    <article
      aria-label={`Entrada ${index + 1} de ${count}`}
      className="flex w-full max-w-[880px] flex-col overflow-hidden rounded-3xl border border-border bg-card md:min-h-[232px] md:flex-row"
    >
      <div className="relative h-[130px] shrink-0 md:h-full md:w-[200px]">
        <Image src={event.imageUrl} alt="" fill sizes="(min-width: 768px) 200px, 100vw" className="object-cover" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-5 py-[18px] md:gap-2 md:px-7 md:py-[26px]">
        <span className="text-[11px] font-semibold tracking-wider text-primary uppercase md:text-xs">{event.category}</span>
        <h2 className="text-xl leading-tight font-bold tracking-tight md:text-2xl">{event.title}</h2>
        <p className="text-sm text-muted-foreground md:text-[15px]">
          {formatEventDateParts(event.date).long} · {event.venue}, {event.city}
        </p>
        <dl className="mt-2 grid grid-cols-3 gap-2 md:mt-auto md:flex md:gap-7">
          {details.map((detail) => (
            <div key={detail.label} className="flex min-w-0 flex-col">
              <dt className="text-[11px] text-muted-foreground md:text-xs">{detail.label}</dt>
              <dd className="text-sm font-semibold md:text-base">{detail.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="relative flex shrink-0 flex-col items-center justify-center gap-2 border-t-[1.5px] border-dashed border-zinc-300 p-[22px] md:w-[220px] md:border-t-0 md:border-l-[1.5px] md:p-4">
        <span className={`${NOTCH_CLASS} -top-3 -left-3`} />
        <span className={`${NOTCH_CLASS} -top-3 -right-3 md:top-auto md:right-auto md:-bottom-3 md:-left-3`} />
        <QrPattern seed={ticket.seed} className="size-[168px] md:size-[120px]" />
        <span aria-live="polite" className="text-[13px] whitespace-nowrap text-muted-foreground">
          Entrada {index + 1} de {count}
        </span>
        {count > 1 && (
          <div className="flex items-center gap-2">
            <button type="button" aria-label="Entrada anterior" onClick={onPrevious} disabled={index === 0} className={NAV_CLASS}>
              <ChevronLeft className="size-5" aria-hidden="true" />
            </button>
            <button type="button" aria-label="Entrada siguiente" onClick={onNext} disabled={index === count - 1} className={NAV_CLASS}>
              <ChevronRight className="size-5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
