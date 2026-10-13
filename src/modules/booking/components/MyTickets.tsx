"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Ticket } from "lucide-react";

import { cn } from "@/lib/utils";
import { EventCover } from "@/modules/event/components/EventCover";
import { formatEventDateParts } from "@/modules/event/event.utils";
import { TicketDetailCard } from "@/modules/booking/components/TicketDetailCard";
import type { MyOrder } from "@/modules/booking/order.types";
import { splitOrdersByDate } from "@/modules/booking/order.utils";

interface MyTicketsProps {
  /** The signed-in user's orders with tickets. */
  orders: MyOrder[];
  /** Today in Lima ("YYYY-MM-DD"), computed on the server. */
  today: string;
}

type Tab = "upcoming" | "past";

function Notice({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-3xl border-[1.5px] border-dashed border-zinc-300 bg-card px-6 py-14 text-center lg:rounded-[28px] lg:py-20">
      <span className="flex size-14 items-center justify-center rounded-[18px] bg-indigo-50 text-primary">{icon}</span>
      <h2 className="text-lg font-semibold lg:text-xl">{title}</h2>
      <p className="max-w-[420px] text-[15px] leading-relaxed text-muted-foreground">{text}</p>
      {action}
    </div>
  );
}

const ACTION_CLASS =
  "mt-2 flex h-12 items-center gap-2 rounded-[14px] bg-foreground px-5 text-[15px] font-semibold text-background focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** The signed-in user's orders split into upcoming and past, with the selected order's tickets. */
export function MyTickets({ orders, today }: MyTicketsProps) {
  const [tab, setTab] = useState<Tab>("upcoming");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const groups = splitOrdersByDate(orders, today);
  const list = groups[tab];
  const selected = list.find((order) => order.id === selectedId) ?? list[0];

  const tabs: { key: Tab; label: string }[] = [
    { key: "upcoming", label: `Próximas (${groups.upcoming.length})` },
    { key: "past", label: `Pasadas (${groups.past.length})` },
  ];

  return (
    <div className="flex flex-col gap-5 lg:gap-7">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight lg:text-4xl">Mis entradas</h1>
        <div role="group" aria-label="Filtrar entradas" className="flex gap-1 self-start rounded-[14px] border border-border bg-card p-1">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={tab === item.key}
              onClick={() => setTab(item.key)}
              className={cn(
                "h-10 cursor-pointer rounded-[10px] px-[18px] text-sm font-semibold focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                tab === item.key ? "bg-foreground text-background" : "hover:bg-muted",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {list.length === 0 ? (
        <Notice
          icon={<Ticket className="size-6" aria-hidden="true" />}
          title={tab === "past" ? "Aún no tienes eventos pasados" : "No tienes entradas próximas"}
          text={
            tab === "past"
              ? "Cuando vayas a tu primer evento, lo verás aquí."
              : "Cuando compres entradas, aparecerán aquí con su QR."
          }
          action={
            <Link href="/events" className={ACTION_CLASS}>
              Explorar eventos
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start lg:gap-8">
          <ul aria-label="Pedidos" className="flex flex-col gap-3">
            {list.map((order) => {
              const { event } = order;
              const isSelected = order.id === selected?.id;
              const zones = [...new Set(order.tickets.map((ticket) => ticket.zoneName))].join(", ");
              const count = order.tickets.length;
              return (
                <li key={order.id}>
                  <button
                    type="button"
                    aria-current={isSelected ? "true" : undefined}
                    onClick={() => setSelectedId(order.id)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-3.5 rounded-[20px] border-2 bg-card p-3.5 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      isSelected ? "border-primary" : "border-border hover:border-zinc-300",
                    )}
                  >
                    <span className="relative size-[72px] shrink-0 overflow-hidden rounded-[14px] bg-zinc-200">
                      <EventCover src={event.imageUrl} alt="" sizes="72px" />
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-base font-semibold">{event.title}</span>
                      <span className="text-[13px] text-muted-foreground">
                        {formatEventDateParts(event.date).short} · {event.city}
                      </span>
                      <span className="truncate text-[13px] font-medium text-primary">
                        {count === 1 ? "1 entrada" : `${count} entradas`} · {zones}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {selected && <TicketDetailCard key={selected.id} event={selected.event} order={selected} />}
        </div>
      )}
    </div>
  );
}
