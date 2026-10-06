"use client";

import { useState, useTransition } from "react";
import { UserPlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { changeOrganizerStatusAction } from "@/modules/user/actions";
import { DeleteUserDialog } from "@/modules/user/components/DeleteUserDialog";
import { EditUserDialog } from "@/modules/user/components/EditUserDialog";
import { InviteStaffDialog } from "@/modules/user/components/InviteStaffDialog";
import { UsersFilters } from "@/modules/user/components/UsersFilters";
import { UsersPagination } from "@/modules/user/components/UsersPagination";
import { UsersTable } from "@/modules/user/components/UsersTable";
import { useUsersQuery } from "@/modules/user/hooks/use-users-query";
import { canAssignRole } from "@/modules/user/user.permissions";
import type { ActionResult, Role, UserRow, UsersPage, UsersQuery } from "@/modules/user/user.types";

interface UsersAdminProps {
  actor: { id: string; role: Role };
  query: UsersQuery;
  page: UsersPage;
}

/** Users management: filters, table, pagination and the invite / edit / delete dialogs. */
export function UsersAdmin({ actor, query, page }: UsersAdminProps) {
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState<UserRow | null>(null);
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const { clear } = useUsersQuery(query);

  const inviteRoles = (["admin", "organizer"] as const).filter((role) => canAssignRole(actor.role, "customer", role));
  const hasFilters = Boolean(query.q || query.role || query.status);

  function toggleStatus(row: UserRow) {
    startTransition(async () =>
      setNotice(
        await changeOrganizerStatusAction({
          userId: row.id,
          status: row.organizerStatus === "approved" ? "suspended" : "approved",
        }),
      ),
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Usuarios y roles</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {page.total === 1 ? "1 usuario" : `${page.total} usuarios`}
            {hasFilters && " con los filtros actuales"}
          </p>
        </div>
        {inviteRoles.length > 0 && (
          <Button type="button" onClick={() => setIsInviteOpen(true)} className="h-11 cursor-pointer gap-2 rounded-xl px-5">
            <UserPlus className="size-5" aria-hidden="true" />
            Invitar usuario
          </Button>
        )}
      </div>

      <div role="status" aria-live="polite">
        {notice && (
          <div
            className={
              notice.ok
                ? "flex items-center justify-between gap-3 rounded-xl bg-green-100 py-1 pr-1 pl-4 text-sm font-medium text-green-800"
                : "flex items-center justify-between gap-3 rounded-xl bg-red-100 py-1 pr-1 pl-4 text-sm font-medium text-red-800"
            }
          >
            <span>{notice.ok ? (notice.message ?? "Listo.") : notice.error}</span>
            <Button
              type="button"
              variant="ghost"
              aria-label="Cerrar aviso"
              onClick={() => setNotice(null)}
              className="size-11 cursor-pointer rounded-xl"
            >
              <X className="size-5" aria-hidden="true" />
            </Button>
          </div>
        )}
      </div>

      <UsersFilters query={query} />

      <div className="overflow-hidden rounded-2xl border border-border bg-background">
        <UsersTable
          rows={page.items}
          actor={actor}
          hasFilters={hasFilters}
          disabled={isPending}
          onEdit={setEditing}
          onDelete={setDeleting}
          onToggleStatus={toggleStatus}
          onClearFilters={clear}
        />
        <UsersPagination query={query} total={page.total} page={page.page} pageCount={page.pageCount} />
      </div>

      {inviteRoles.length > 0 && (
        <InviteStaffDialog roles={inviteRoles} open={isInviteOpen} onOpenChange={setIsInviteOpen} onSuccess={setNotice} />
      )}
      <EditUserDialog user={editing} actor={actor} onClose={() => setEditing(null)} onSuccess={setNotice} />
      <DeleteUserDialog user={deleting} onClose={() => setDeleting(null)} onSuccess={setNotice} />
    </div>
  );
}
