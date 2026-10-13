"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateUserAction } from "@/modules/user/actions";
import { ROLE_LABEL } from "@/modules/user/components/role-labels";
import { ASSIGNABLE_ROLES, canAssignRole } from "@/modules/user/user.permissions";
import type { ActionResult, Role, UserRow } from "@/modules/user/user.types";

type ManualStatus = "approved" | "suspended";

// "Pendiente" can't be picked: an admin either approves or suspends.
const STATUS_ITEMS: Record<ManualStatus, string> = { approved: "Aprobado", suspended: "Suspendido" };

interface EditUserDialogProps {
  /** The user being edited; `null` keeps the dialog closed. */
  user: UserRow | null;
  actor: { role: Role };
  onClose: () => void;
  onSuccess: (result: ActionResult) => void;
}

function toManualStatus(status: UserRow["organizerStatus"]): ManualStatus | undefined {
  return status === "approved" || status === "suspended" ? status : undefined;
}

function EditForm({ user, actor, onDone }: { user: UserRow; actor: { role: Role }; onDone: (result: ActionResult) => void }) {
  const [role, setRole] = useState<Role>(user.role);
  const [status, setStatus] = useState<ManualStatus | undefined>(toManualStatus(user.organizerStatus));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const roleOptions = [...new Set<Role>([user.role, ...ASSIGNABLE_ROLES.filter((next) => canAssignRole(actor.role, user.role, next))])];
  const roleItems = Object.fromEntries(roleOptions.map((option) => [option, ROLE_LABEL[option]]));
  const isOrganizer = role === "organizer";
  const unchanged = role === user.role && (!isOrganizer || status === undefined || status === user.organizerStatus);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateUserAction({ userId: user.id, role, status: isOrganizer ? status : undefined });
      if (result.ok) onDone(result);
      else setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FormField id="edit-name" label="Nombre" required={false}>
        <Input id="edit-name" value={user.fullName ?? ""} readOnly disabled className="h-11 rounded-xl" />
      </FormField>
      <FormField id="edit-email" label="Correo" required={false}>
        <Input id="edit-email" value={user.email} readOnly disabled className="h-11 rounded-xl" />
        <p className="text-xs text-muted-foreground">Nombre y correo vienen de la cuenta de Google y no se editan aquí.</p>
      </FormField>

      <div className="flex flex-wrap gap-3">
        <FormField id="edit-role" label="Rol" required={false} className="min-w-[160px] flex-1">
          <Select value={role} items={roleItems} onValueChange={(next) => setRole(next as Role)}>
            <SelectTrigger id="edit-role" className="h-11 w-full rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {ROLE_LABEL[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        {isOrganizer && (
          <FormField id="edit-status" label="Estado de organizador" required={false} className="min-w-[160px] flex-1">
            <Select value={status ?? null} items={STATUS_ITEMS} onValueChange={(next) => setStatus(next as ManualStatus)}>
              <SelectTrigger id="edit-status" className="h-11 w-full rounded-xl">
                <SelectValue placeholder="Pendiente" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_ITEMS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}
      </div>

      {error && (
        <p role="alert" className="text-[13px] font-medium text-destructive">
          {error}
        </p>
      )}

      <DialogFooter>
        <Button type="submit" disabled={isPending || unchanged} className="h-11 cursor-pointer rounded-xl px-5">
          {isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Edits the role and, for organizers, the approval status. */
export function EditUserDialog({ user, actor, onClose, onSuccess }: EditUserDialogProps) {
  return (
    <Dialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Editar usuario</DialogTitle>
        </DialogHeader>
        {user && (
          <EditForm
            user={user}
            actor={actor}
            onDone={(result) => {
              onClose();
              onSuccess(result);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
