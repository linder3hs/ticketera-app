import Image from "next/image";
import Link from "next/link";
import { ImageIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatEventDateParts, formatEventPrice } from "@/modules/event/event.utils";
import type { OrganizerEvent } from "@/modules/organizer/organizer.types";

/** Column template shared by the table header and rows (from `xl`). */
export const EVENT_TABLE_COLUMNS = "xl:grid-cols-[minmax(0,1fr)_120px_220px_130px_120px]";

const number = new Intl.NumberFormat("es-PE");

function Thumbnail({ event }: { event: OrganizerEvent }) {
  return (
    <span className="relative flex size-[52px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-100 text-zinc-400">
      {event.imageUrl ? (
        <Image
          src={event.imageUrl}
          alt=""
          fill
          sizes="52px"
          className="object-cover"
          // Covers uploaded here are data URLs; next/image can't optimize those.
          unoptimized={event.imageUrl.startsWith("data:")}
        />
      ) : (
        <ImageIcon className="size-5" aria-hidden="true" />
      )}
    </span>
  );
}

/** One organizer event: a card on small screens, a table row from `xl`. */
export function OrganizerEventRow({ event }: { event: OrganizerEvent }) {
  const isDraft = event.status === "draft";
  const percent = event.capacity > 0 ? Math.round((event.sold / event.capacity) * 100) : 0;
  const date = event.date ? formatEventDateParts(event.date).short : "Sin fecha";
  const place = event.city || "Sin ciudad";

  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-3 rounded-[20px] border border-border bg-card p-3.5 xl:items-center xl:gap-4 xl:rounded-none xl:border-0 xl:border-t xl:bg-transparent xl:px-6 xl:py-3.5",
        EVENT_TABLE_COLUMNS,
      )}
    >
      <span className="flex min-w-0 items-center gap-3 xl:gap-3.5">
        <Thumbnail event={event} />
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[15px] font-semibold">{event.title}</span>
          <span className="text-xs text-muted-foreground xl:text-[13px]">
            {date} · {place}
          </span>
        </span>
      </span>

      <span className="self-start xl:self-auto">
        <span
          className={cn(
            "inline-flex h-[26px] items-center rounded-full px-2.5 text-[11px] font-semibold xl:h-7 xl:px-3 xl:text-xs",
            isDraft ? "bg-muted text-zinc-700" : "bg-green-100 text-green-800",
          )}
        >
          {isDraft ? "Borrador" : "Publicado"}
        </span>
      </span>

      <span className="col-span-2 flex flex-col gap-1.5 xl:col-span-1">
        <span className="flex justify-between text-[13px] tabular-nums xl:justify-start">
          <span>
            <strong className="font-semibold">{number.format(event.sold)}</strong>
            <span className="text-muted-foreground"> / {number.format(event.capacity)} vendidas</span>
          </span>
          <strong className="font-semibold xl:hidden">
            {isDraft ? "—" : formatEventPrice(event.sold * event.priceFrom, event.currency)}
          </strong>
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
        {isDraft ? "—" : formatEventPrice(event.sold * event.priceFrom, event.currency)}
      </span>

      <span className="col-span-2 xl:col-span-1 xl:text-right">
        {/* "Ver ventas" and editing are next-phase screens: links back to the panel for now. */}
        <Link
          href={isDraft ? "/organizer/events/new" : "/organizer"}
          className="flex h-11 items-center justify-center rounded-xl border-[1.5px] border-zinc-300 px-3.5 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 xl:inline-flex xl:h-10"
        >
          {isDraft ? "Editar" : "Ver ventas"}
        </Link>
      </span>
    </li>
  );
}
