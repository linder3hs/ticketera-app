"use client";

import { useState } from "react";
import { Heart } from "lucide-react";

import { cn } from "@/lib/utils";

interface SaveEventButtonProps {
  className?: string;
}

/** Heart toggle; local state only until there are user accounts. */
export function SaveEventButton({ className }: SaveEventButtonProps) {
  const [isSaved, setIsSaved] = useState(false);

  return (
    <button
      type="button"
      aria-label="Guardar evento"
      aria-pressed={isSaved}
      onClick={() => setIsSaved((saved) => !saved)}
      className={cn("cursor-pointer", className)}
    >
      <Heart className={cn("size-5", isSaved && "fill-current text-rose-400")} aria-hidden="true" />
    </button>
  );
}
