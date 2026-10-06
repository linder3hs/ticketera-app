"use client";

import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inviteStaffAction } from "@/modules/user/actions";
import { ROLE_LABEL } from "@/modules/user/components/role-labels";
import type { ActionResult } from "@/modules/user/user.types";

type StaffRole = "admin" | "organizer";

interface InviteStaffDialogProps {
  /** Roles the actor may hand out. */
  roles: StaffRole[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the successful outcome; failures stay inside the dialog. */
  onSuccess: (result: ActionResult) => void;
}

function InviteForm({ roles, onDone }: { roles: StaffRole[]; onDone: (result: ActionResult) => void }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>(roles[0]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await inviteStaffAction({ email, role });
      if (result.ok) onDone(result);
      else setError(result.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FormField id="invite-email" label="Correo" error={error ?? undefined}>
        <Input
          id="invite-email"
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setError(null);
          }}
          placeholder="persona@correo.com"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "invite-email-error" : undefined}
          className="h-11 rounded-xl"
        />
      </FormField>
      <FormField id="invite-role" label="Rol">
        <Select value={role} onValueChange={(value) => setRole(value as StaffRole)} items={ROLE_LABEL}>
          <SelectTrigger id="invite-role" className="h-11 w-full rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map((item) => (
              <SelectItem key={item} value={item}>
                {ROLE_LABEL[item]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <DialogFooter>
        <Button type="submit" disabled={isPending} className="h-11 cursor-pointer rounded-xl px-5">
          {isPending ? "Enviando…" : "Enviar invitación"}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** "Invitar usuario": gives an existing account the role, or emails an invitation. */
export function InviteStaffDialog({ roles, open, onOpenChange, onSuccess }: InviteStaffDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Invitar usuario</DialogTitle>
          <DialogDescription>Si el correo ya tiene cuenta, se cambia su rol. Si no, recibe una invitación.</DialogDescription>
        </DialogHeader>
        <InviteForm
          roles={roles}
          onDone={(result) => {
            onOpenChange(false);
            onSuccess(result);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
