"use client";

import { useState } from "react";
import { Star } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSetEventFeatured } from "@/modules/event/hooks/use-event-mutations";

interface FeaturedToggleProps {
  eventId: string;
  title: string;
  /** Current value in the DB; `aria-pressed` follows it once the list/page refreshes. */
  featured: boolean;
  /** Only published (and upcoming) events reach the landing's Hero. */
  published: boolean;
  /** Icon only (44×44 px), for table rows. */
  compact?: boolean;
  /** Receives the success message; without it the message shows in this component's own `role="status"`. */
  onToggled?: (message: string) => void;
}

function successMessage(title: string, featured: boolean, published: boolean): string {
  if (!featured) return `“${title}” ya no aparece en la portada.`;
  return published
    ? `“${title}” ahora aparece en la portada.`
    : `“${title}” quedó destacado: aparecerá en la portada cuando se publique.`;
}

/** Marks or unmarks an event as featured on the landing (admin only; the server re-checks). */
export function FeaturedToggle({ eventId, title, featured, published, compact = false, onToggled }: FeaturedToggleProps) {
  const setFeatured = useSetEventFeatured();
  const [message, setMessage] = useState("");
  const pending = setFeatured.isPending;
  const error = setFeatured.error?.message;

  async function toggle() {
    const next = !featured;
    setMessage("");
    try {
      await setFeatured.mutateAsync({ id: eventId, featured: next });
    } catch {
      return; // the mutation state carries the message
    }
    const text = successMessage(title, next, published);
    if (onToggled) onToggled(text);
    else setMessage(text);
  }

  return (
    <div className={cn("flex flex-col gap-1.5", compact ? "shrink-0 items-end" : "items-start")}>
      <Button
        type="button"
        variant={compact ? "ghost" : "outline"}
        size={compact ? "icon" : "default"}
        aria-pressed={featured}
        aria-label={`Destacar “${title}” en la portada`}
        aria-busy={pending || undefined}
        disabled={pending}
        onClick={() => void toggle()}
        className={cn(
          "aria-pressed:border-amber-300 aria-pressed:bg-amber-50",
          compact ? "size-11 rounded-xl" : "h-11 gap-2 rounded-xl px-4 text-sm font-semibold",
        )}
      >
        <Star
          className={cn("size-5", featured ? "fill-amber-400 text-amber-500" : "text-muted-foreground")}
          aria-hidden="true"
        />
        {!compact && "Destacar en la portada"}
      </Button>
      {!onToggled && (
        <p role="status" className="text-sm font-medium text-green-800">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className={cn("text-sm font-medium text-destructive", compact && "max-w-48 text-right text-xs")}>
          {error}
        </p>
      )}
    </div>
  );
}
