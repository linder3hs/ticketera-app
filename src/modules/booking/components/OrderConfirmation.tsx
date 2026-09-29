"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarPlus, CircleCheck, Download, Mail, QrCode, SearchX, Ticket } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatEventPrice } from "@/modules/event/event.utils";
import { useBookingStore } from "@/modules/booking/booking.store";
import { TicketPass } from "@/modules/booking/components/TicketPass";
import { downloadIcs, downloadTicketsPdf, getOrderTickets, type ExportEvent } from "@/modules/booking/ticket-export";

interface OrderConfirmationProps {
  event: ExportEvent & { id: string; imageUrl: string };
}

const NEXT_STEPS = [
  { icon: Mail, title: "Revisa tu correo", text: "Ahí llegan tus entradas y el comprobante de pago." },
  { icon: QrCode, title: "Muestra tu QR", text: "Cada entrada tiene su propio QR. Muéstralo desde tu celular en el ingreso." },
  { icon: Ticket, title: "Todo en Mis entradas", text: "Entra con tu cuenta para ver y descargar tus entradas cuando quieras." },
];

const SECONDARY_BUTTON_CLASS =
  "h-[50px] cursor-pointer gap-2 rounded-[14px] border-[1.5px] border-zinc-300 bg-background px-5 text-sm font-medium md:h-[54px] md:rounded-2xl md:text-[15px]";

/** Step 3: the paid order from the store, with its tickets and what's next. */
export function OrderConfirmation({ event }: OrderConfirmationProps) {
  const order = useBookingStore((state) => state.lastOrder);
  const [index, setIndex] = useState(0);
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  if (!order || order.eventId !== event.id) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-3 px-4 py-16 text-center">
        <span className="flex size-14 items-center justify-center rounded-[18px] bg-indigo-50 text-primary">
          <SearchX className="size-6" aria-hidden="true" />
        </span>
        <h1 className="text-xl font-semibold">No encontramos tu compra</h1>
        <p className="text-[15px] text-muted-foreground">
          Si ya pagaste, revisa tu correo: ahí llegan tus entradas.
        </p>
        <Link
          href="/"
          className="mt-2 flex h-12 items-center rounded-[14px] bg-foreground px-5 text-[15px] font-semibold text-background focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Ir al inicio
        </Link>
      </div>
    );
  }

  const tickets = getOrderTickets(order);
  const current = tickets[Math.min(index, tickets.length - 1)];

  return (
    <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 pt-8 pb-12 md:gap-9 md:px-6 md:pt-14 md:pb-18">
      <div className="flex flex-col items-center gap-3 text-center md:gap-3.5">
        <span className="flex size-16 items-center justify-center rounded-full bg-green-100 text-green-700 md:size-[76px]">
          <CircleCheck className="size-8 md:size-10" aria-hidden="true" />
        </span>
        <h1 className="text-[28px] leading-tight font-bold tracking-tight md:text-[40px]">¡Compra confirmada!</h1>
        <p className="max-w-[520px] text-[15px] leading-relaxed text-muted-foreground md:text-[17px]">
          Enviamos tus entradas a <strong className="font-semibold text-foreground">{order.email}</strong>. También
          las tienes siempre en Mis entradas.
        </p>
        <span className="flex h-9 items-center rounded-full border border-border bg-background px-4 text-sm text-zinc-700">
          Pedido N.º <strong className="ml-1.5 font-semibold text-foreground">{order.id}</strong>
        </span>
      </div>

      <TicketPass
        event={event}
        ticket={current}
        index={index}
        count={tickets.length}
        totalLabel={formatEventPrice(order.total, order.currency)}
        onPrevious={() => setIndex((value) => Math.max(0, value - 1))}
        onNext={() => setIndex((value) => Math.min(tickets.length - 1, value + 1))}
      />

      <div className="grid w-full max-w-[880px] grid-cols-2 gap-2.5 md:flex md:w-auto md:justify-center md:gap-3">
        {/* Visual only until "Mis entradas" exists. */}
        <Button className="col-span-2 h-[54px] cursor-pointer gap-2 rounded-2xl px-6 text-base font-semibold">
          Ver mis entradas
          <ArrowRight className="size-[18px]" aria-hidden="true" />
        </Button>
        <Button variant="outline" className={SECONDARY_BUTTON_CLASS} onClick={() => downloadIcs(event, order)}>
          <CalendarPlus className="size-[18px]" aria-hidden="true" />
          <span className="md:hidden">Calendario</span>
          <span className="hidden md:inline">Agregar al calendario</span>
        </Button>
        <Button
          variant="outline"
          className={SECONDARY_BUTTON_CLASS}
          disabled={isPdfLoading}
          onClick={async () => {
            setIsPdfLoading(true);
            try {
              await downloadTicketsPdf(event, order);
            } finally {
              setIsPdfLoading(false);
            }
          }}
        >
          <Download className="size-[18px]" aria-hidden="true" />
          {isPdfLoading ? "Generando…" : "Descargar PDF"}
        </Button>
      </div>

      <ol className="grid w-full max-w-[880px] gap-3 md:mt-3 md:grid-cols-3 md:gap-4">
        {NEXT_STEPS.map(({ icon: Icon, title, text }) => (
          <li key={title} className="flex gap-3.5 rounded-[20px] border border-border bg-card p-4 md:flex-col md:gap-2.5 md:p-5">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-indigo-50 text-primary">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="flex flex-col gap-1 md:gap-2.5">
              <span className="text-base font-semibold">{title}</span>
              <span className="text-sm leading-normal text-muted-foreground">{text}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
