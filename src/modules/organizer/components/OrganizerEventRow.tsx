"use client";

import { useId, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ImageIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatEventDateParts, formatEventPrice } from "@/modules/event/event.utils";
import type { EventStatus, ManagedEventRow } from "@/modules/event/event-list.types";
import { useDeleteEvent, useRetryEventRefunds, useSetEventStatus } from "@/modules/event/hooks/use-event-mutations";
import { FeaturedToggle } from "@/modules/organizer/components/FeaturedToggle";
import { useOrganizerStore } from "@/modules/organizer/organizer.store";
import type { DispatchResult } from "@/modules/refund/refund.types";

/** Column template shared by the table header and rows (from `xl`). */
export const EVENT_TABLE_COLUMNS = "xl:grid-cols-[minmax(0,1fr)_100px_170px_100px_340px]";

/** Actions that need a confirmation dialog. */
type ConfirmKind = "unpublish" | "cancel" | "delete";
type RowAction = ConfirmKind | "publish";

const TARGET_STATUS = { publish: "published", unpublish: "draft", cancel: "cancelled" } as const;

const NOTICE: Record<RowAction, (title: string) => string> = {
  publish: (title) => `“${title}” se publicó.`,
  unpublish: (title) => `“${title}” volvió a borrador.`,
  cancel: (title) => `“${title}” se canceló.`,
  delete: (title) => `“${title}” se eliminó.`,
};

/** What the organizer reads after retrying the refunds: what is still pending, or that nothing was. */
function describeRetry(title: string, { dispatched, pending }: DispatchResult): string {
  if (pending > 0) return `Quedan ${pending} reembolsos de “${title}” por procesar. Puedes reintentar más tarde.`;
  if (dispatched > 0) return `Se enviaron los reembolsos de “${title}”.`;
  return `“${title}” no tiene reembolsos pendientes.`;
}

const CONFIRM_COPY: Record<
  ConfirmKind,
  { heading: (title: string) => string; description: string; confirm: string; destructive: boolean }
> = {
  unpublish: {
    heading: (title) => `¿Despublicar “${title}”?`,
    description: "El evento dejará de estar a la venta y volverá a borrador. Podrás publicarlo de nuevo.",
    confirm: "Despublicar",
    destructive: false,
  },
  cancel: {
    heading: (title) => `¿Cancelar “${title}”?`,
    description:
      "El evento quedará cancelado y ya no se podrá editar. Se reembolsará automáticamente a los compradores.",
    confirm: "Cancelar evento",
    destructive: true,
  },
  delete: {
    heading: (title) => `¿Eliminar “${title}”?`,
    description: "Se borrarán el evento y sus zonas. Esta acción no se puede deshacer.",
    confirm: "Eliminar",
    destructive: true,
  },
};

/** Min 44px touch target on cards (AC14); compact inside the table so the row doesn't overflow. */
const ACTION_CLASS = "h-11 flex-1 rounded-xl px-3.5 text-sm font-semibold xl:h-8 xl:flex-none xl:rounded-lg xl:px-2.5 xl:text-[13px]";

const number = new Intl.NumberFormat("es-PE");

export const STATUS_LABEL: Record<EventStatus, string> = {
  draft: "Borrador",
  published: "Publicado",
  cancelled: "Cancelado",
  finished: "Finalizado",
};

const STATUS_CLASS: Record<EventStatus, string> = {
  draft: "bg-muted text-zinc-700",
  published: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  finished: "bg-zinc-200 text-zinc-700",
};

function Thumbnail({ event }: { event: ManagedEventRow }) {
  return (
    <span className="relative flex size-[52px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-100 text-zinc-400">
      {event.coverImageUrl ? (
        <Image
          src={event.coverImageUrl}
          alt=""
          fill
          sizes="52px"
          unoptimized
          className="object-cover"
        />
      ) : (
        <ImageIcon className="size-5" aria-hidden="true" />
      )}
    </span>
  );
}

interface ConfirmActionDialogProps {
  kind: ConfirmKind;
  title: string;
  pending: boolean;
  error: string | undefined;
  onConfirm: () => void;
  onClose: () => void;
}

/** Confirmation for a destructive action; the server error stays inside, the dialog only closes on success. */
function ConfirmActionDialog({ kind, title, pending, error, onConfirm, onClose }: ConfirmActionDialogProps) {
  const copy = CONFIRM_COPY[kind];

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.heading(title)}</AlertDialogTitle>
          <AlertDialogDescription>{copy.description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Volver</AlertDialogCancel>
          <AlertDialogAction variant={copy.destructive ? "destructive" : "default"} disabled={pending} onClick={onConfirm}>
            {pending ? "Procesando…" : copy.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface OrganizerEventRowProps {
  event: ManagedEventRow;
  /** Why an editable draft cannot be published (e.g. organizer not approved); shown instead of hiding "Publicar". */
  publishDeniedReason?: string | null;
}

/** One organizer event: a card on small screens, a table row from `xl`. */
export function OrganizerEventRow({ event, publishDeniedReason = null }: OrganizerEventRowProps) {
  const isDraft = event.status === "draft";
  const percent = event.capacity > 0 ? Math.round((event.sold / event.capacity) * 100) : 0;
  const date = event.date ? formatEventDateParts(event.date).short : "Sin fecha";
  const place = event.city || "Sin ciudad";
  const revenue = isDraft ? "—" : formatEventPrice(event.revenueCents / 100, event.currency);

  const { capabilities } = event;
  const hintId = useId();
  const [confirming, setConfirming] = useState<ConfirmKind | null>(null);
  const setStatus = useSetEventStatus();
  const remove = useDeleteEvent();
  const retryRefunds = useRetryEventRefunds();
  const setNotice = useOrganizerStore((state) => state.setNotice);
  const busy = setStatus.isPending || remove.isPending || retryRefunds.isPending;
  const canRetryRefunds = event.status === "cancelled" && event.sold > 0;
  const showPublishHint = isDraft && capabilities.edit && !capabilities.publish && publishDeniedReason !== null;
  // Publishing and retrying refunds have no dialog: their error shows in the row. The others show it inside their dialog.
  const error = (confirming === "delete" ? remove : (retryRefunds.error ? retryRefunds : setStatus)).error?.message;

  function closeDialog() {
    setConfirming(null);
    setStatus.reset();
    remove.reset();
    retryRefunds.reset();
  }

  async function retry() {
    try {
      setNotice(describeRetry(event.title, await retryRefunds.mutateAsync({ id: event.id })));
    } catch {
      // the mutation state carries the message
    }
  }

  async function run(action: RowAction) {
    try {
      if (action === "delete") await remove.mutateAsync({ id: event.id });
      else await setStatus.mutateAsync({ id: event.id, status: TARGET_STATUS[action] });
    } catch {
      return; // the mutation state carries the message
    }
    setNotice(NOTICE[action](event.title));
    closeDialog();
  }

  function ask(kind: ConfirmKind) {
    setStatus.reset();
    remove.reset();
    retryRefunds.reset();
    setConfirming(kind);
  }

  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-3 rounded-[20px] border border-border bg-card p-3.5 xl:items-center xl:gap-4 xl:rounded-none xl:border-0 xl:border-t xl:bg-transparent xl:px-6 xl:py-3.5",
        EVENT_TABLE_COLUMNS,
      )}
    >
      <div className="flex min-w-0 items-center gap-3 xl:gap-3.5">
        <Thumbnail event={event} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-semibold">{event.title}</span>
          <span className="text-xs text-muted-foreground xl:text-[13px]">
            {date} · {place}
          </span>
        </span>
        {capabilities.feature && (
          <FeaturedToggle
            compact
            eventId={event.id}
            title={event.title}
            featured={event.featured}
            published={event.status === "published"}
            onToggled={setNotice}
          />
        )}
      </div>

      <span className="self-start xl:self-auto">
        <span
          className={cn(
            "inline-flex h-[26px] items-center rounded-full px-2.5 text-[11px] font-semibold xl:h-7 xl:px-3 xl:text-xs",
            STATUS_CLASS[event.status],
          )}
        >
          {STATUS_LABEL[event.status]}
        </span>
      </span>

      <span className="col-span-2 flex flex-col gap-1.5 xl:col-span-1">
        <span className="flex justify-between text-[13px] tabular-nums xl:justify-start">
          <span>
            <strong className="font-semibold">{number.format(event.sold)}</strong>
            <span className="text-muted-foreground"> / {number.format(event.capacity)} vendidas</span>
          </span>
          <strong className="font-semibold xl:hidden">{revenue}</strong>
        </span>
        <span
          role="progressbar"
          aria-label={`${event.title}: ${percent}% vendido`}
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          className="block h-1.5 overflow-hidden rounded-full bg-zinc-100"
        >
          <span className="block h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </span>
      </span>

      <span className="hidden text-right text-sm font-semibold tabular-nums xl:block">
        {revenue}
      </span>

      <div className="col-span-2 flex flex-wrap gap-2 xl:col-span-1 xl:flex-nowrap xl:justify-end xl:gap-1.5">
        {capabilities.edit && (
          <Link
            href={`/organizer/events/${event.id}/edit`}
            aria-label={`Editar ${event.title}`}
            className={cn(buttonVariants({ variant: "outline" }), ACTION_CLASS, "inline-flex")}
          >
            Editar
          </Link>
        )}
        {capabilities.publish && (
          <Button
            variant="default"
            aria-label={`Publicar ${event.title}`}
            disabled={busy}
            className={ACTION_CLASS}
            onClick={() => run("publish")}
          >
            {setStatus.isPending && !confirming ? "Publicando…" : "Publicar"}
          </Button>
        )}
        {showPublishHint && (
          <Button
            variant="outline"
            aria-label={`Publicar ${event.title}`}
            aria-disabled="true"
            aria-describedby={hintId}
            className={cn(ACTION_CLASS, "cursor-not-allowed opacity-60")}
          >
            Publicar
          </Button>
        )}
        {capabilities.unpublish && (
          <Button
            variant="outline"
            aria-label={`Despublicar ${event.title}`}
            disabled={busy}
            className={ACTION_CLASS}
            onClick={() => ask("unpublish")}
          >
            Despublicar
          </Button>
        )}
        {capabilities.cancel && (
          <Button
            variant="destructive"
            aria-label={`Cancelar ${event.title}`}
            disabled={busy}
            className={ACTION_CLASS}
            onClick={() => ask("cancel")}
          >
            Cancelar
          </Button>
        )}
        {canRetryRefunds && (
          <Button
            variant="outline"
            aria-label={`Reintentar reembolsos de ${event.title}`}
            disabled={busy}
            className={ACTION_CLASS}
            onClick={retry}
          >
            {retryRefunds.isPending ? "Reintentando…" : "Reintentar reembolsos"}
          </Button>
        )}
        {capabilities.delete && (
          <Button
            variant="destructive"
            aria-label={`Eliminar ${event.title}`}
            disabled={busy}
            className={ACTION_CLASS}
            onClick={() => ask("delete")}
          >
            Eliminar
          </Button>
        )}
      </div>

      {showPublishHint && (
        <p id={hintId} className="col-span-full text-xs text-muted-foreground xl:text-right">
          {publishDeniedReason}
        </p>
      )}
      {!confirming && error && (
        <p role="alert" className="col-span-full text-sm font-medium text-destructive xl:text-right">
          {error}
        </p>
      )}

      {confirming && (
        <ConfirmActionDialog
          kind={confirming}
          title={event.title}
          pending={busy}
          error={error}
          onConfirm={() => run(confirming)}
          onClose={closeDialog}
        />
      )}
    </li>
  );
}
