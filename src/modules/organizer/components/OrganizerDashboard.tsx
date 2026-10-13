"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, CircleAlert, CircleCheck, Plus, Ticket, TrendingUp, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { PUBLISH_BLOCKER_MESSAGES } from "@/modules/event/event.policy";
import { EVENT_PAGE_SIZES } from "@/modules/event/event-list.schema";
import type { SalesSummary } from "@/modules/event/event-list.types";
import { formatEventPrice } from "@/modules/event/event.utils";
import { useEvents } from "@/modules/event/hooks/use-events";
import { useOrganizerStore } from "@/modules/organizer/organizer.store";
import type { OrganizerStatus, StripeOnboardingStatus } from "@/modules/user/user.types";
import { NO_FILTERS, OrganizerEventFilters, type EventFilters } from "@/modules/organizer/components/OrganizerEventFilters";
import { EVENT_TABLE_COLUMNS, OrganizerEventRow } from "@/modules/organizer/components/OrganizerEventRow";

const number = new Intl.NumberFormat("es-PE");

/** Why an organizer who is not approved cannot publish (the server enforces it; this explains the disabled button). */
const PUBLISH_DENIED_REASON: Partial<Record<OrganizerStatus, string>> = {
  pending: "Tu perfil de organizador está pendiente de aprobación: aún no puedes publicar eventos.",
  suspended: "Tu perfil de organizador está suspendido: no puedes publicar eventos.",
};

interface OrganizerDashboardProps {
  summary: SalesSummary;
  /** Result of `canCreateEvent`; the server action is the real gate. */
  canCreate: boolean;
  /** `null` for admins, who have no organizer profile. */
  organizerStatus: OrganizerStatus | null;
  /** Payments (Stripe Connect) onboarding; `null` for admins. */
  connectStatus: StripeOnboardingStatus | null;
}

/** KPIs (computed on the server) and the live list of the organizer's events. */
export function OrganizerDashboard({ summary, canCreate, organizerStatus, connectStatus }: OrganizerDashboardProps) {
  const notice = useOrganizerStore((state) => state.notice);
  const clearNotice = useOrganizerStore((state) => state.clearNotice);
  const [filters, setFilters] = useState<EventFilters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const events = useEvents({ ...filters, page, pageSize: EVENT_PAGE_SIZES[0] });

  const changeFilters = useCallback((next: EventFilters) => {
    setFilters(next);
    setPage(1);
  }, []);
  // Notices (after saving, after a row action) are moved out of the store into the view and dismissable.
  const [shownNotice, setShownNotice] = useState(notice);
  if (notice && notice !== shownNotice) setShownNotice(notice);

  useEffect(() => {
    if (notice) clearNotice();
  }, [notice, clearNotice]);

  const connectIncomplete = connectStatus !== null && connectStatus !== "complete";
  // Approval comes first, then payments (same order as the server's publish blockers).
  const publishDeniedReason =
    (organizerStatus ? PUBLISH_DENIED_REASON[organizerStatus] : undefined) ??
    (connectIncomplete ? PUBLISH_BLOCKER_MESSAGES.connect_incomplete : null);

  const rows = events.data?.items ?? [];

  const cards = [
    { label: "Entradas vendidas", value: number.format(summary.sold), icon: Ticket },
    { label: "Ingresos", value: formatEventPrice(summary.revenueCents / 100, "PEN"), icon: TrendingUp },
    { label: "Eventos publicados", value: String(summary.published), icon: CalendarCheck },
  ];

  return (
    <div className="flex flex-col gap-5 lg:gap-8">
      {shownNotice && (
        <div role="status" className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
          <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">{shownNotice}</p>
          <Button variant="ghost" size="icon" aria-label="Cerrar aviso" className="size-11" onClick={() => setShownNotice(null)}>
            <X aria-hidden="true" />
          </Button>
        </div>
      )}

      {connectIncomplete && (
        <div role="status" className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">{PUBLISH_BLOCKER_MESSAGES.connect_incomplete}</p>
          <Link href="/organizer/settings" className="shrink-0 font-semibold underline underline-offset-2">
            Ir a configuración
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-1 lg:gap-1.5">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight lg:text-4xl">Eventos</h1>
        <p className="text-sm text-muted-foreground lg:text-[15px]">Así van las ventas de tus eventos.</p>
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between xl:px-6 xl:pt-[18px]">
          <h2 id="events-title" className="text-lg font-semibold">
            Mis eventos
          </h2>
          {canCreate && (
            <Link
              href="/organizer/events/new"
              className={cn(buttonVariants(), "h-11 gap-2 rounded-xl px-5 text-sm font-semibold")}
            >
              <Plus className="size-[18px]" aria-hidden="true" />
              Crear evento
            </Link>
          )}
        </div>

        <div className="xl:border-b xl:border-zinc-100 xl:px-6 xl:py-4">
          <OrganizerEventFilters filters={filters} onChange={changeFilters} />
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
          <span className="text-right">Acciones</span>
        </div>

        {events.isError ? (
          <div role="alert" className="flex flex-col items-center gap-3 rounded-[20px] border border-dashed border-red-200 bg-card p-8 text-center text-sm xl:rounded-none xl:border-0 xl:border-t xl:border-solid xl:border-zinc-100">
            <p className="text-red-800">{events.error.message}</p>
            <Button variant="outline" onClick={() => events.refetch()}>
              Reintentar
            </Button>
          </div>
        ) : events.isPending ? (
          <ul aria-busy="true" aria-label="Cargando eventos" className="flex flex-col gap-2.5 xl:gap-0">
            {[0, 1, 2].map((item) => (
              <li key={item} className="h-[88px] animate-pulse rounded-[20px] border border-border bg-card xl:rounded-none xl:border-0 xl:border-t" />
            ))}
          </ul>
        ) : rows.length > 0 ? (
          <ul className={cn("flex flex-col gap-2.5 xl:gap-0", events.isPlaceholderData && "opacity-60")}>
            {rows.map((event) => (
              <OrganizerEventRow key={event.id} event={event} publishDeniedReason={publishDeniedReason} />
            ))}
          </ul>
        ) : (
          <p className="rounded-[20px] border border-dashed border-zinc-300 bg-card p-8 text-center text-sm text-muted-foreground xl:rounded-none xl:border-0 xl:border-t xl:border-solid xl:border-zinc-100">
            No hay eventos que coincidan con los filtros.
          </p>
        )}

        {events.data && events.data.pageCount > 1 && (
          <nav aria-label="Paginación" className="flex items-center justify-between gap-3 xl:border-t xl:border-zinc-100 xl:px-6 xl:py-3">
            <Button variant="outline" disabled={events.data.page <= 1} onClick={() => setPage(events.data.page - 1)}>
              Anterior
            </Button>
            <span className="text-sm text-muted-foreground tabular-nums">
              Página {events.data.page} de {events.data.pageCount}
            </span>
            <Button variant="outline" disabled={events.data.page >= events.data.pageCount} onClick={() => setPage(events.data.page + 1)}>
              Siguiente
            </Button>
          </nav>
        )}
      </section>
    </div>
  );
}
