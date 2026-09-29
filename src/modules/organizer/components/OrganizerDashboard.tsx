"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, CircleCheck, Plus, Ticket, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { usePersistHydration } from "@/lib/use-persist-hydration";
import { buttonVariants } from "@/components/ui/button";
import { formatEventPrice } from "@/modules/event/event.utils";
import { useOrganizerStore } from "@/modules/organizer/organizer.store";
import type { OrganizerEvent } from "@/modules/organizer/organizer.types";
import { getOrganizerKpis } from "@/modules/organizer/services/organizer-service";
import { EVENT_TABLE_COLUMNS, OrganizerEventRow } from "@/modules/organizer/components/OrganizerEventRow";

type Filter = "all" | "published" | "draft";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "published", label: "Publicados" },
  { key: "draft", label: "Borradores" },
];

const number = new Intl.NumberFormat("es-PE");

/** KPIs and the event list (sample events plus the ones created here). */
export function OrganizerDashboard({ sampleEvents }: { sampleEvents: OrganizerEvent[] }) {
  const hydrated = usePersistHydration(useOrganizerStore);
  const createdEvents = useOrganizerStore((state) => state.createdEvents);
  const notice = useOrganizerStore((state) => state.notice);
  const clearNotice = useOrganizerStore((state) => state.clearNotice);
  const [filter, setFilter] = useState<Filter>("all");
  // The notice is shown once: keep it for this visit, clear it from the store.
  const [shownNotice] = useState(notice);

  useEffect(() => {
    if (notice) clearNotice();
  }, [notice, clearNotice]);

  const events = [...(hydrated ? createdEvents : []), ...sampleEvents];
  const kpis = getOrganizerKpis(events);
  const rows = events.filter((event) => filter === "all" || event.status === filter);

  const cards = [
    { label: "Entradas vendidas", value: number.format(kpis.sold), icon: Ticket },
    { label: "Ingresos", value: formatEventPrice(kpis.revenue, "PEN"), icon: TrendingUp },
    { label: "Eventos publicados", value: String(kpis.published), icon: CalendarCheck },
  ];

  return (
    <div className="flex flex-col gap-5 lg:gap-8">
      {shownNotice && (
        <p role="status" className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
          {shownNotice}
        </p>
      )}

      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
        <div className="flex flex-col gap-1 lg:gap-1.5">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight lg:text-4xl">Resumen</h1>
          <p className="text-sm text-muted-foreground lg:text-[15px]">Así van las ventas de tus eventos.</p>
        </div>
        <Link
          href="/organizer/events/new"
          className={cn(buttonVariants(), "h-[50px] gap-2 rounded-[14px] px-[22px] text-[15px] font-semibold")}
        >
          <Plus className="size-[18px]" aria-hidden="true" />
          Crear evento
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-5">
        {cards.map(({ label, value, icon: Icon }, index) => (
          <div
            key={label}
            className={cn(
              "flex flex-col gap-1.5 rounded-[20px] border border-border bg-card p-[18px] lg:gap-2 lg:rounded-[22px] lg:p-6",
              index === 1 && "col-span-2 row-start-1 md:col-span-1 md:row-start-auto",
            )}
          >
            <dt className="flex items-center gap-2 text-[13px] text-muted-foreground lg:text-sm">
              <Icon className="hidden size-4 lg:block" aria-hidden="true" />
              {label}
            </dt>
            <dd className="text-[22px] font-bold tracking-tight tabular-nums lg:text-[32px]">{value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="events-title" className="flex flex-col gap-3 xl:gap-0 xl:overflow-hidden xl:rounded-[22px] xl:border xl:border-border xl:bg-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between xl:border-b xl:border-zinc-100 xl:px-6 xl:py-[18px]">
          <h2 id="events-title" className="text-lg font-semibold">
            Mis eventos
          </h2>
          <div role="group" aria-label="Filtrar eventos" className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-200 p-1 sm:flex xl:bg-muted">
            {FILTERS.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={filter === item.key}
                onClick={() => setFilter(item.key)}
                className={cn(
                  "h-10 cursor-pointer rounded-[9px] px-3.5 text-[13px] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 xl:h-9",
                  filter === item.key ? "bg-background font-semibold shadow-sm" : "font-medium",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div
          aria-hidden="true"
          className={cn(
            "hidden gap-4 px-6 py-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase xl:grid",
            EVENT_TABLE_COLUMNS,
          )}
        >
          <span>Evento</span>
          <span>Estado</span>
          <span>Vendidas</span>
          <span className="text-right">Ingresos</span>
          <span />
        </div>

        {rows.length > 0 ? (
          <ul className="flex flex-col gap-2.5 xl:gap-0">
            {rows.map((event) => (
              <OrganizerEventRow key={event.id} event={event} />
            ))}
          </ul>
        ) : (
          <p className="rounded-[20px] border border-dashed border-zinc-300 bg-card p-8 text-center text-sm text-muted-foreground xl:rounded-none xl:border-0 xl:border-t xl:border-solid xl:border-zinc-100">
            No tienes eventos en este filtro.
          </p>
        )}
      </section>
    </div>
  );
}
