"use client";

import { useState, useTransition } from "react";
import { TriangleAlert } from "lucide-react";

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
import { deleteUserAction } from "@/modules/user/actions";
import type { ActionResult, UserRow } from "@/modules/user/user.types";

interface DeleteUserDialogProps {
  /** The user to delete; `null` keeps the dialog closed. */
  user: UserRow | null;
  onClose: () => void;
  onSuccess: (result: ActionResult) => void;
}

function DeleteConfirm({ user, onClose, onSuccess }: Omit<DeleteUserDialogProps, "user"> & { user: UserRow }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteUserAction({ userId: user.id });
      if (result.ok) {
        onClose();
        onSuccess(result);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogMedia className="bg-red-100 text-red-800">
          <TriangleAlert aria-hidden="true" />
        </AlertDialogMedia>
        <AlertDialogTitle>¿Eliminar a {user.fullName ?? user.email}?</AlertDialogTitle>
        <AlertDialogDescription>Perderá el acceso a Ticketera. Esta acción no se puede deshacer.</AlertDialogDescription>
      </AlertDialogHeader>
      {error && (
        <p role="alert" className="text-[13px] font-medium text-destructive">
          {error}
        </p>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel className="h-11 cursor-pointer rounded-xl px-5">Cancelar</AlertDialogCancel>
        {/* A plain button, not AlertDialogAction: it must stay open to show a server error. */}
        <Button
          type="button"
          variant="destructive"
          disabled={isPending}
          onClick={handleDelete}
          className="h-11 cursor-pointer rounded-xl px-5"
        >
          {isPending ? "Eliminando…" : "Eliminar"}
        </Button>
      </AlertDialogFooter>
    </>
  );
}

/** Confirmation before removing a user. */
export function DeleteUserDialog({ user, onClose, onSuccess }: DeleteUserDialogProps) {
  return (
    <AlertDialog open={user !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        {user && <DeleteConfirm user={user} onClose={onClose} onSuccess={onSuccess} />}
      </AlertDialogContent>
    </AlertDialog>
  );
}
