"use client";

import { useState, useTransition } from "react";
import { VenetianMask } from "lucide-react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { startImpersonationAction } from "@/modules/user/impersonation-actions";
import type { UserRow } from "@/modules/user/user.types";

interface ImpersonateUserDialogProps {
  /** The user to act as; `null` keeps the dialog closed. */
  user: UserRow | null;
  onClose: () => void;
}

function ImpersonateConfirm({ user }: { user: UserRow }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      // On success the action redirects (the await rejects with the redirect, handled by Next): only errors come back.
      const result = await startImpersonationAction({ userId: user.id });
      if (!result.ok) setError(result.error);
    });
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogMedia className="bg-amber-100 text-amber-900">
          <VenetianMask aria-hidden="true" />
        </AlertDialogMedia>
        <AlertDialogTitle>¿Impersonar a {user.fullName ?? user.email}?</AlertDialogTitle>
        <AlertDialogDescription>
          Verás Ticketera y actuarás como este usuario hasta que salgas. Todo lo que hagas quedará registrado a tu nombre.
        </AlertDialogDescription>
      </AlertDialogHeader>
      {error && (
        <p role="alert" className="text-[13px] font-medium text-destructive">
          {error}
        </p>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel className="h-11 cursor-pointer rounded-xl px-5">Cancelar</AlertDialogCancel>
        {/* A plain button, not AlertDialogAction: it must stay open to show a server error. */}
        <Button type="button" disabled={isPending} onClick={handleConfirm} className="h-11 cursor-pointer rounded-xl px-5">
          {isPending ? "Entrando…" : "Impersonar"}
        </Button>
      </AlertDialogFooter>
    </>
  );
}

/** Confirmation before acting as another user. */
export function ImpersonateUserDialog({ user, onClose }: ImpersonateUserDialogProps) {
  return (
    <AlertDialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>{user && <ImpersonateConfirm user={user} />}</AlertDialogContent>
    </AlertDialog>
  );
}
