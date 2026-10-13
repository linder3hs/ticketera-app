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
import type { VenueActionResult } from "@/modules/venue/venue.types";

interface ConfirmDeleteDialogProps {
  open: boolean;
  title: string;
  description: string;
  /** Label of the destructive button (e.g. "Eliminar recinto"). */
  confirmLabel: string;
  onClose: () => void;
  /** The deletion; its `error` is shown inside the dialog, which stays open. */
  onConfirm: () => Promise<VenueActionResult>;
  /** Runs after the dialog closes on success (e.g. refresh the page). */
  onSuccess: () => void;
}

type ConfirmBodyProps = Omit<ConfirmDeleteDialogProps, "open">;

/** Mounted only while open, so the error and pending state reset every time. */
function ConfirmBody({ title, description, confirmLabel, onClose, onConfirm, onSuccess }: ConfirmBodyProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      const result = await onConfirm();
      if (result.ok) {
        onClose();
        onSuccess();
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
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      {error && (
        <p role="alert" className="text-[13px] font-medium text-destructive">
          {error}
        </p>
      )}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isPending} className="h-11 cursor-pointer rounded-xl px-5">
          Cancelar
        </AlertDialogCancel>
        {/* A plain button, not AlertDialogAction: it must stay open to show a server error. */}
        <Button
          type="button"
          variant="destructive"
          disabled={isPending}
          onClick={handleConfirm}
          className="h-11 cursor-pointer rounded-xl px-5"
        >
          {isPending ? "Eliminando…" : confirmLabel}
        </Button>
      </AlertDialogFooter>
    </>
  );
}

/** Confirmation before a destructive venue action (venue or zone); shows the server error without closing. */
export function ConfirmDeleteDialog({ open, onClose, ...body }: ConfirmDeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent>
        <ConfirmBody onClose={onClose} {...body} />
      </AlertDialogContent>
    </AlertDialog>
  );
}
