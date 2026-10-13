"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, Lock, Plus, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { deleteVenueAction } from "@/modules/venue/actions";
import { ConfirmDeleteDialog } from "@/modules/venue/components/ConfirmDeleteDialog";
import type { VenueListRow, VenueOwner } from "@/modules/venue/venue.types";

interface VenueListProps {
  rows: VenueListRow[];
}

const OWNER_LABEL: Record<VenueOwner, string> = {
  own: "Tuyo",
  platform: "Plataforma",
  other: "De otro organizador",
};

const number = new Intl.NumberFormat("es-PE");

const ACTION_CLASS = "h-11 cursor-pointer rounded-xl px-4 text-sm font-semibold";

function OwnerBadge({ owner }: { owner: VenueOwner }) {
  return (
    <Badge variant="secondary" className="h-6 px-2.5">
      {OWNER_LABEL[owner]}
    </Badge>
  );
}

function UnusableBadge() {
  return <Badge className="h-6 bg-amber-100 px-2.5 text-amber-800">Sin zonas utilizables</Badge>;
}

function RowActions({ row, onDelete }: { row: VenueListRow; onDelete: (row: VenueListRow) => void }) {
  const reason = row.blockedReason;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        <Link
          href={`/organizer/venues/${row.id}`}
          aria-label={`${row.capabilities.edit ? "Editar" : "Ver"} ${row.name}`}
          className={cn(buttonVariants({ variant: "outline" }), ACTION_CLASS)}
        >
          {row.capabilities.edit ? "Editar" : "Ver"}
        </Link>
        {row.capabilities.delete && (
          <Button
            type="button"
            variant="destructive"
            aria-label={`Eliminar ${row.name}`}
            onClick={() => onDelete(row)}
            className={ACTION_CLASS}
          >
            Eliminar
          </Button>
        )}
      </div>
      {reason && (
        <p className="flex items-center gap-1.5 text-right text-xs text-muted-foreground">
          <Lock className="size-3.5 shrink-0" aria-hidden="true" />
          {reason}
        </p>
      )}
    </div>
  );
}

function VenueTable({ rows, onDelete }: { rows: VenueListRow[]; onDelete: (row: VenueListRow) => void }) {
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="h-11 px-5">Recinto</TableHead>
              <TableHead>Ciudad</TableHead>
              <TableHead className="text-right">Zonas</TableHead>
              <TableHead className="text-right">Asientos</TableHead>
              <TableHead className="text-right">Capacidad</TableHead>
              <TableHead>Propietario</TableHead>
              <TableHead className="pr-5 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="max-w-64 px-5 py-3">
                  <div className="flex flex-col items-start gap-1.5">
                    <span className="max-w-full truncate text-sm font-medium">{row.name}</span>
                    {!row.usable && <UnusableBadge />}
                  </div>
                </TableCell>
                <TableCell>{row.city}</TableCell>
                <TableCell className="text-right tabular-nums">{number.format(row.zoneCount)}</TableCell>
                <TableCell className="text-right tabular-nums">{number.format(row.seatCount)}</TableCell>
                <TableCell className="text-right tabular-nums">{number.format(row.capacity)}</TableCell>
                <TableCell>
                  <OwnerBadge owner={row.owner} />
                </TableCell>
                <TableCell className="pr-5">
                  <RowActions row={row} onDelete={onDelete} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-3 p-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-3 rounded-2xl border border-border p-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[15px] font-semibold">{row.name}</span>
              <span className="text-[13px] text-muted-foreground">{row.city}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <OwnerBadge owner={row.owner} />
              {!row.usable && <UnusableBadge />}
            </div>
            <dl className="grid grid-cols-3 gap-2 text-[13px]">
              <div>
                <dt className="text-muted-foreground">Zonas</dt>
                <dd className="font-semibold tabular-nums">{number.format(row.zoneCount)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Asientos</dt>
                <dd className="font-semibold tabular-nums">{number.format(row.seatCount)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Capacidad</dt>
                <dd className="font-semibold tabular-nums">{number.format(row.capacity)}</dd>
              </div>
            </dl>
            <RowActions row={row} onDelete={onDelete} />
          </li>
        ))}
      </ul>
    </>
  );
}

/** All venues with what the viewer may do with each; deleting asks for confirmation first. */
export function VenueList({ rows }: VenueListProps) {
  const router = useRouter();
  // The target stays while the dialog closes, so its text does not vanish mid-animation.
  const [target, setTarget] = useState<VenueListRow | null>(null);
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  function askDelete(row: VenueListRow) {
    setTarget(row);
    setOpen(true);
  }

  return (
    <div className="flex flex-col gap-5 lg:gap-8">
      {notice && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-800"
        >
          <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">{notice}</p>
          <Button variant="ghost" size="icon" aria-label="Cerrar aviso" className="size-11" onClick={() => setNotice(null)}>
            <X aria-hidden="true" />
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1 lg:gap-1.5">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight lg:text-4xl">Recintos</h1>
          <p className="text-sm text-muted-foreground lg:text-[15px]">
            Todos los recintos disponibles para tus eventos. Solo editas los que creaste.
          </p>
        </div>
        <Link href="/organizer/venues/new" className={cn(buttonVariants(), "h-11 gap-2 rounded-xl px-5 text-sm font-semibold")}>
          <Plus className="size-[18px]" aria-hidden="true" />
          Crear recinto
        </Link>
      </div>

      <section aria-label="Lista de recintos" className="overflow-hidden rounded-[22px] border border-border bg-card">
        {rows.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-base font-semibold">Todavía no hay recintos</p>
            <p className="mt-1 text-sm text-muted-foreground">Crea el primero para usarlo en un evento.</p>
          </div>
        ) : (
          <VenueTable rows={rows} onDelete={askDelete} />
        )}
      </section>

      {target && (
        <ConfirmDeleteDialog
          open={open}
          title={`¿Eliminar “${target.name}”?`}
          description="Se borrarán el recinto con sus zonas y asientos. Esta acción no se puede deshacer."
          confirmLabel="Eliminar recinto"
          onClose={() => setOpen(false)}
          onConfirm={() => deleteVenueAction({ id: target.id })}
          onSuccess={() => {
            setNotice(`Eliminamos “${target.name}”.`);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
