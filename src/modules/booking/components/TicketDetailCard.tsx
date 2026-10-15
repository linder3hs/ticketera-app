"use client";

import { useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, Download, MapPin, Calendar } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RefundNotice } from "@/modules/booking/components/RefundNotice";
import { TicketQr } from "@/modules/booking/components/TicketQr";
import { TICKET_STATUS_LABELS } from "@/modules/booking/components/ticket-status-labels";
import type { MyOrder, MyOrderEvent } from "@/modules/booking/order.types";
import { downloadIcs, downloadTicketsPdf, getValidTickets } from "@/modules/booking/ticket-export";
import { EventCover } from "@/modules/event/components/EventCover";
import { formatEventDateParts } from "@/modules/event/event.utils";

interface TicketDetailCardProps {
  event: MyOrderEvent;
  order: MyOrder;
}

const NOTCH_CLASS = "absolute -top-3 size-6 rounded-full border border-border bg-muted";
const NAV_CLASS =
  "flex size-11 cursor-pointer items-center justify-center rounded-xl border-[1.5px] border-zinc-300 bg-background hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40";

/** One order's tickets, one at a time: event, QR, ticket data and downloads. */
export function TicketDetailCard({ event, order }: TicketDetailCardProps) {
  const [index, setIndex] = useState(0);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const tickets = order.tickets;
  const ticket = tickets[Math.min(index, tickets.length - 1)];
  if (!ticket) return null;

  const date = formatEventDateParts(event.date);

  const details = [
    { label: "Zona", value: ticket.zoneName },
    { label: "Asiento", value: ticket.seatLabel ?? "Sin asiento asignado" },
    { label: "Titular", value: ticket.holderName },
    { label: "Código", value: `${order.code}-${String(index + 1).padStart(2, "0")}` },
  ];

  return (
    <article className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card lg:rounded-[28px]">
      <div className="relative h-40 bg-zinc-200 lg:h-[200px]">
        <EventCover src={event.imageUrl} alt={event.imageAlt} sizes="(min-width: 1024px) 800px, 100vw" />
        <span className="absolute top-3 left-3 flex w-[54px] flex-col items-center rounded-[14px] bg-white py-1.5 lg:top-4 lg:left-4 lg:w-[60px] lg:rounded-2xl">
          <span className="text-[11px] font-bold tracking-widest text-primary">{date.month}</span>
          <span className="text-[22px] leading-none font-bold lg:text-2xl">{date.day}</span>
        </span>
      </div>

      <div className="flex flex-col gap-3 px-5 pt-5 pb-5 lg:gap-3.5 lg:px-8 lg:pt-[26px] lg:pb-6">
        <h2 className="text-[22px] leading-tight font-bold tracking-tight lg:text-[28px]">{event.title}</h2>
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground lg:text-[15px]">
          <li className="flex items-center gap-2">
            <Calendar className="size-4" aria-hidden="true" />
            {date.long}
          </li>
          <li className="flex items-center gap-2">
            <Clock className="size-4" aria-hidden="true" />
            {event.startsAt} h
          </li>
          <li className="flex items-center gap-2">
            <MapPin className="size-4" aria-hidden="true" />
            {event.venue}, {event.city}
          </li>
        </ul>
        {order.refund && <RefundNotice refund={order.refund} currency={event.currency} />}
      </div>

      <div className="relative border-t-[1.5px] border-dashed border-zinc-300" aria-hidden="true">
        <span className={`${NOTCH_CLASS} -left-3`} />
        <span className={`${NOTCH_CLASS} -right-3`} />
      </div>

      <div className="flex flex-col items-center gap-6 px-5 pt-6 pb-6 md:flex-row md:items-center md:gap-9 lg:px-8 lg:pt-7 lg:pb-8">
        <div className="shrink-0 rounded-[18px] border border-border bg-white p-3">
          <TicketQr ticket={ticket} className="size-[176px]" />
        </div>

        <div className="flex w-full flex-1 flex-col gap-[18px]">
          <div className="flex items-center justify-between gap-3">
            <span aria-live="polite" className="text-lg font-bold whitespace-nowrap lg:text-xl">
              Entrada {index + 1} de {tickets.length}
            </span>
            {tickets.length > 1 && (
              <span className="flex gap-1.5">
                <button
                  type="button"
                  aria-label="Entrada anterior"
                  disabled={index === 0}
                  onClick={() => setIndex((value) => value - 1)}
                  className={NAV_CLASS}
                >
                  <ChevronLeft className="size-[18px]" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Entrada siguiente"
                  disabled={index === tickets.length - 1}
                  onClick={() => setIndex((value) => value + 1)}
                  className={NAV_CLASS}
                >
                  <ChevronRight className="size-[18px]" aria-hidden="true" />
                </button>
              </span>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3.5">
            {details.map((detail) => (
              <div key={detail.label} className="flex min-w-0 flex-col gap-0.5">
                <dt className="text-xs text-muted-foreground">{detail.label}</dt>
                <dd className="truncate text-[15px] font-semibold tabular-nums lg:text-base">{detail.value}</dd>
              </div>
            ))}
            <div className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">Estado</dt>
              <dd className={cn("text-[15px] font-semibold lg:text-base", ticket.status === "valid" ? "text-green-700" : "text-muted-foreground")}>
                {TICKET_STATUS_LABELS[ticket.status]}
              </dd>
            </div>
          </dl>

          <div className="grid grid-cols-2 gap-2.5 sm:flex">
            <Button
              variant="outline"
              disabled={isPdfLoading || getValidTickets(order).length === 0}
              onClick={async () => {
                setIsPdfLoading(true);
                try {
                  await downloadTicketsPdf(event, order);
                } finally {
                  setIsPdfLoading(false);
                }
              }}
              className="h-12 cursor-pointer gap-2 rounded-[14px] border-[1.5px] border-foreground px-[18px] text-sm font-semibold"
            >
              <Download className="size-[17px]" aria-hidden="true" />
              {isPdfLoading ? "Generando…" : "Descargar PDF"}
            </Button>
            <Button
              variant="outline"
              onClick={() => downloadIcs(event, order)}
              className="h-12 cursor-pointer gap-2 rounded-[14px] border-[1.5px] border-zinc-300 px-[18px] text-sm font-medium"
            >
              <CalendarPlus className="size-[17px]" aria-hidden="true" />
              <span className="sm:hidden">Calendario</span>
              <span className="hidden sm:inline">Agregar al calendario</span>
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
