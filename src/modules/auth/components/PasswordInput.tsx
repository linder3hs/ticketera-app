"use client";

import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/** Password input with a show/hide toggle inside it. */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<typeof Input>, "type">) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative">
      <Input {...props} type={isVisible ? "text" : "password"} className={cn("pr-14", className)} />
      <button
        type="button"
        aria-label={isVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={isVisible}
        onClick={() => setIsVisible((visible) => !visible)}
        className="absolute top-1 right-1 flex size-11 cursor-pointer items-center justify-center rounded-[10px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {isVisible ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
      </button>
    </div>
  );
}
