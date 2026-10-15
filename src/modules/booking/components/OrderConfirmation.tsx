"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarPlus,
  CircleAlert,
  CircleCheck,
  Clock,
  Download,
  LoaderCircle,
  Mail,
  QrCode,
  SearchX,
  Ticket,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatEventPrice } from "@/modules/event/event.utils";
import { TicketPass } from "@/modules/booking/components/TicketPass";
import { useMyOrder } from "@/modules/booking/hooks/use-my-order";
import type { MyOrder } from "@/modules/booking/order.types";
import { downloadIcs, downloadTicketsPdf, getValidTickets } from "@/modules/booking/ticket-export";

interface OrderConfirmationProps {
  /** The signed-in user's order, or `null` when it is missing, malformed or someone else's. */
  order: MyOrder | null;
}

const NEXT_STEPS = [
  { icon: Mail, title: "Revisa tu correo", text: "Ahí llegan tus entradas y el comprobante de pago." },
  { icon: QrCode, title: "Muestra tu QR", text: "Cada entrada tiene su propio QR. Muéstralo desde tu celular en el ingreso." },
  { icon: Ticket, title: "Todo en Mis entradas", text: "Entra con tu cuenta para ver y descargar tus entradas cuando quieras." },
];

const SECONDARY_BUTTON_CLASS =
  "h-[50px] cursor-pointer gap-2 rounded-[14px] border-[1.5px] border-zinc-300 bg-background px-5 text-sm font-medium md:h-[54px] md:rounded-2xl md:text-[15px]";

const PRIMARY_LINK_CLASS =
  "flex h-12 items-center rounded-[14px] bg-foreground px-5 text-[15px] font-semibold text-background focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

const SECONDARY_LINK_CLASS =
  "flex h-12 items-center rounded-[14px] border-[1.5px] border-zinc-300 bg-background px-5 text-[15px] font-medium focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

interface StatusPanelProps {
  icon: LucideIcon;
  /** Tailwind classes of the icon's circle (color). */
  iconClass?: string;
  spin?: boolean;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}

/** A centered message with an icon, used by every view that is not the paid order. */
function StatusPanel({ icon: Icon, iconClass = "bg-indigo-50 text-primary", spin, title, children, actions }: StatusPanelProps) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 px-4 py-16 text-center">
      <span className={cn("flex size-14 items-center justify-center rounded-[18px]", iconClass)}>
        <Icon className={cn("size-6", spin && "animate-spin")} aria-hidden="true" />
      </span>
      <h1 className="text-xl font-semibold">{title}</h1>
      {children}
      {actions && <div className="mt-2 flex flex-wrap items-center justify-center gap-2.5">{actions}</div>}
    </div>
  );
}

function OrderCodeBadge({ code }: { code: string }) {
  return (
    <span className="flex h-9 items-center rounded-full border border-border bg-background px-4 text-sm text-zinc-700">
      Pedido N.º <strong className="ml-1.5 font-semibold text-foreground">{code}</strong>
    </span>
  );
}

function NotFound() {
  return (
    <StatusPanel
      icon={SearchX}
      title="No encontramos tu compra"
      actions={
        <Link href="/my-tickets" className={PRIMARY_LINK_CLASS}>
          Ir a Mis entradas
        </Link>
      }
    >
      <p className="text-[15px] text-muted-foreground">
        Si ya pagaste, tus entradas aparecerán en Mis entradas cuando se confirme el pago.
      </p>
    </StatusPanel>
  );
}

/**
 * Step 3: the user's real order. It starts from what the server read and keeps asking while the
 * payments webhook has not confirmed it (see `useMyOrder`). `null` = nothing to show.
 */
export function OrderConfirmation({ order }: OrderConfirmationProps) {
  return order ? <ConfirmationBody initialOrder={order} /> : <NotFound />;
}

function ConfirmationBody({ initialOrder }: { initialOrder: MyOrder }) {
  const { order, view, error, retry } = useMyOrder(initialOrder.code, initialOrder);
  const [index, setIndex] = useState(0);
  const [isPdfLoading, setIsPdfLoading] = useState(false);

  const retryError = error && (
    <>
      <p role="alert" className="text-[15px] font-medium text-destructive">
        No pudimos consultar el estado de tu compra. Intenta de nuevo.
      </p>
      <Button variant="outline" className={cn(SECONDARY_BUTTON_CLASS, "mt-1")} onClick={retry}>
        Reintentar
      </Button>
    </>
  );

  if (view === "not-found") return <NotFound />;

  if (view === "processing") {
    return (
      <StatusPanel icon={LoaderCircle} spin title="Procesando tu pago…">
        <p aria-live="polite" className="text-[15px] text-muted-foreground">
          Estamos confirmando tu pago. No cierres esta página: tus entradas aparecerán aquí en unos segundos.
        </p>
        <OrderCodeBadge code={order.code} />
        {retryError}
      </StatusPanel>
    );
  }

  if (view === "timed-out") {
    return (
      <StatusPanel
        icon={Clock}
        title="Tu pago sigue procesándose"
        actions={
          <Link href="/my-tickets" className={PRIMARY_LINK_CLASS}>
            Ir a Mis entradas
          </Link>
        }
      >
        <p className="text-[15px] text-muted-foreground">
          Tu entrada llegará a Mis entradas apenas se confirme el pago. No hace falta que vuelvas a pagar.
        </p>
        <OrderCodeBadge code={order.code} />
        {retryError}
      </StatusPanel>
    );
  }

  if (view === "failed") {
    return (
      <StatusPanel
        icon={CircleAlert}
        iconClass="bg-red-50 text-destructive"
        title="No pudimos completar tu compra…"
        actions={
          <>
            <Link href={`/events/${order.event.slug}`} className={PRIMARY_LINK_CLASS}>
              Volver al evento
            </Link>
            <Link href="/my-tickets" className={SECONDARY_LINK_CLASS}>
              Mis entradas
            </Link>
          </>
        }
      >
        <p className="text-[15px] text-muted-foreground">
          Las entradas ya no estaban disponibles. Si se te cobró, te reembolsaremos automáticamente.
        </p>
        <OrderCodeBadge code={order.code} />
      </StatusPanel>
    );
  }

  const current = order.tickets[Math.min(index, order.tickets.length - 1)];

  return (
    <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 pt-8 pb-12 md:gap-9 md:px-6 md:pt-14 md:pb-18">
      <div className="flex flex-col items-center gap-3 text-center md:gap-3.5">
        <span className="flex size-16 items-center justify-center rounded-full bg-green-100 text-green-700 md:size-[76px]">
          <CircleCheck className="size-8 md:size-10" aria-hidden="true" />
        </span>
        <h1 className="text-[28px] leading-tight font-bold tracking-tight md:text-[40px]">¡Compra confirmada!</h1>
        <p className="max-w-[520px] text-[15px] leading-relaxed text-muted-foreground md:text-[17px]">
          Enviamos tus entradas a <strong className="font-semibold text-foreground">{order.buyerEmail}</strong>.
          También las tienes siempre en Mis entradas.
        </p>
        <OrderCodeBadge code={order.code} />
      </div>

      {current && (
        <TicketPass
          event={order.event}
          ticket={current}
          index={index}
          count={order.tickets.length}
          totalLabel={formatEventPrice(order.total, order.currency)}
          onPrevious={() => setIndex((value) => Math.max(0, value - 1))}
          onNext={() => setIndex((value) => Math.min(order.tickets.length - 1, value + 1))}
        />
      )}

      <div className="grid w-full max-w-[880px] grid-cols-2 gap-2.5 md:flex md:w-auto md:justify-center md:gap-3">
        <Link
          href="/my-tickets"
          className={cn(buttonVariants(), "col-span-2 h-[54px] gap-2 rounded-2xl px-6 text-base font-semibold")}
        >
          Ver mis entradas
          <ArrowRight className="size-[18px]" aria-hidden="true" />
        </Link>
        <Button variant="outline" className={SECONDARY_BUTTON_CLASS} onClick={() => downloadIcs(order.event, order)}>
          <CalendarPlus className="size-[18px]" aria-hidden="true" />
          <span className="md:hidden">Calendario</span>
          <span className="hidden md:inline">Agregar al calendario</span>
        </Button>
        <Button
          variant="outline"
          className={SECONDARY_BUTTON_CLASS}
          disabled={isPdfLoading || getValidTickets(order).length === 0}
          onClick={async () => {
            setIsPdfLoading(true);
            try {
              await downloadTicketsPdf(order.event, order);
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
