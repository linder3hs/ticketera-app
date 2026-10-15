"use client";

import { Show, SignInButton } from "@clerk/nextjs";
import { Heart } from "lucide-react";

import { cn } from "@/lib/utils";
import { useEventFavorite } from "@/modules/favorite/hooks/use-event-favorite";

interface SaveEventButtonProps {
  eventId: string;
  initialSaved: boolean;
  className?: string;
}

/** Heart toggle backed by the user's favorites; signed-out visitors get Clerk's sign-in instead. */
export function SaveEventButton({ eventId, initialSaved, className }: SaveEventButtonProps) {
  const { isSaved, isPending, toggle } = useEventFavorite(eventId, initialSaved);

  const renderButton = (onClick?: () => void) => (
    <button
      type="button"
      aria-label={isSaved ? "Quitar de favoritos" : "Guardar evento"}
      aria-pressed={isSaved}
      disabled={isPending}
      onClick={onClick}
      className={cn("cursor-pointer disabled:cursor-wait disabled:opacity-70", className)}
    >
      <Heart className={cn("size-5", isSaved && "fill-current text-rose-400")} aria-hidden="true" />
    </button>
  );

  return (
    <>
      <Show when="signed-in">{renderButton(toggle)}</Show>
      <Show when="signed-out">
        <SignInButton>{renderButton()}</SignInButton>
      </Show>
    </>
  );
}
