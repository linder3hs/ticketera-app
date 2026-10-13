"use client";

import { Ban, CircleCheck, Lock, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ORGANIZER_STATUS_LABEL, ROLE_LABEL } from "@/modules/user/components/role-labels";
import { canManageUser } from "@/modules/user/user.permissions";
import type { OrganizerStatus, Role, UserRow } from "@/modules/user/user.types";

const ROLE_BADGE: Record<Role, string> = {
  super_admin: "bg-violet-100 text-violet-800",
  admin: "bg-indigo-50 text-indigo-800",
  organizer: "bg-amber-100 text-amber-800",
  customer: "bg-zinc-100 text-zinc-700",
};

const STATUS_BADGE: Record<OrganizerStatus, string> = {
  approved: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-800",
  suspended: "bg-red-100 text-red-800",
};

const ICON_BUTTON_CLASS = "size-11 cursor-pointer rounded-xl text-zinc-600";

interface Actor {
  id: string;
  role: Role;
}

interface UsersTableProps {
  rows: UserRow[];
  actor: Actor;
  /** Whether the empty result comes from filters (offers to clear them). */
  hasFilters: boolean;
  onEdit: (row: UserRow) => void;
  onDelete: (row: UserRow) => void;
  onToggleStatus: (row: UserRow) => void;
  onClearFilters: () => void;
  disabled?: boolean;
}

function displayName(row: UserRow): string {
  return row.fullName ?? row.email;
}

function formatDate(iso: string): string {
  // Fixed zone so the server and the browser render the same day.
  return new Date(iso).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Why `actor` can't change `row`, or `null` when they can. */
function lockReason(actor: Actor, row: UserRow): string | null {
  if (canManageUser(actor, row)) return null;
  if (row.id === actor.id) return "Tu cuenta";
  if (row.role === "super_admin") return "Cuenta protegida";
  return "Solo el super admin";
}

function RoleBadges({ row }: { row: UserRow }) {
  return (
    <>
      <Badge className={cn("h-6 px-2.5", ROLE_BADGE[row.role])}>{ROLE_LABEL[row.role]}</Badge>
      {row.role === "organizer" && row.organizerStatus && (
        <Badge className={cn("h-6 px-2.5", STATUS_BADGE[row.organizerStatus])}>
          {ORGANIZER_STATUS_LABEL[row.organizerStatus]}
        </Badge>
      )}
    </>
  );
}

function UserIdentity({ row, isSelf }: { row: UserRow; isSelf: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[13px] font-semibold text-indigo-800"
      >
        {displayName(row).slice(0, 2).toUpperCase()}
      </span>
      <div className="min-w-0 leading-snug">
        <div className="truncate text-sm font-medium">
          {displayName(row)}
          {isSelf && <Badge variant="secondary" className="ml-2">Tú</Badge>}
        </div>
        <div className="truncate text-[13px] text-muted-foreground">{row.email}</div>
      </div>
    </div>
  );
}

/** Edit / delete (and approve or suspend for organizers), or a lock with the reason. */
function RowActions({
  row,
  actor,
  disabled,
  onEdit,
  onDelete,
  onToggleStatus,
}: Pick<UsersTableProps, "onEdit" | "onDelete" | "onToggleStatus" | "disabled"> & { row: UserRow; actor: Actor }) {
  const reason = lockReason(actor, row);
  if (reason) {
    return (
      <span className="inline-flex items-center gap-1.5 pr-3 text-xs text-muted-foreground">
        <Lock className="size-4" aria-hidden="true" />
        {reason}
      </span>
    );
  }

  const name = displayName(row);
  const isApproved = row.organizerStatus === "approved";

  return (
    <>
      {row.role === "organizer" && row.organizerStatus && (
        <Button
          type="button"
          variant="ghost"
          disabled={disabled}
          aria-label={`${isApproved ? "Suspender" : "Aprobar"} a ${name}`}
          title={isApproved ? "Suspender" : "Aprobar"}
          onClick={() => onToggleStatus(row)}
          className={ICON_BUTTON_CLASS}
        >
          {isApproved ? <Ban className="size-5" aria-hidden="true" /> : <CircleCheck className="size-5" aria-hidden="true" />}
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        disabled={disabled}
        aria-label={`Editar a ${name}`}
        title="Editar"
        onClick={() => onEdit(row)}
        className={ICON_BUTTON_CLASS}
      >
        <Pencil className="size-5" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={disabled}
        aria-label={`Eliminar a ${name}`}
        title="Eliminar"
        onClick={() => onDelete(row)}
        className={cn(ICON_BUTTON_CLASS, "hover:bg-red-100 hover:text-red-800")}
      >
        <Trash2 className="size-5" aria-hidden="true" />
      </Button>
    </>
  );
}

/** Users as a table from `md`, as cards below. */
export function UsersTable({ rows, actor, hasFilters, onClearFilters, ...actions }: UsersTableProps) {
  if (rows.length === 0) {
    return (
      <div className="px-6 py-14 text-center">
        <p className="text-base font-semibold">Sin resultados</p>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">
          {hasFilters ? "Ningún usuario coincide con los filtros." : "Todavía no hay usuarios."}
        </p>
        {hasFilters && (
          <Button type="button" variant="outline" onClick={onClearFilters} className="h-11 cursor-pointer rounded-xl px-4">
            Limpiar filtros
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="h-11 px-5">Usuario</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Registro</TableHead>
              <TableHead className="pr-5 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="px-5 py-3">
                  <UserIdentity row={row} isSelf={row.id === actor.id} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <RoleBadges row={row} />
                  </div>
                </TableCell>
                <TableCell className="text-[13px] text-muted-foreground">{formatDate(row.createdAt)}</TableCell>
                <TableCell className="pr-5">
                  <div className="flex items-center justify-end">
                    <RowActions row={row} actor={actor} {...actions} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="flex flex-col gap-3 p-3 md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-col gap-3 rounded-2xl border border-border p-4">
            <UserIdentity row={row} isSelf={row.id === actor.id} />
            <div className="flex flex-wrap items-center gap-2">
              <RoleBadges row={row} />
              <span className="ml-auto text-xs text-muted-foreground">{formatDate(row.createdAt)}</span>
            </div>
            <div className="flex items-center justify-end">
              <RowActions row={row} actor={actor} {...actions} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
