"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LayoutDashboard, LogOut, Ticket } from "lucide-react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuthStore } from "@/modules/auth/auth.store";
import type { User } from "@/modules/auth/auth.types";

const ITEM_CLASS =
  "flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

/** Account button (initials) with the user's data, shortcuts and sign-out. */
export function AccountMenu({ user }: { user: User }) {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger
        aria-label="Mi cuenta"
        className="flex size-11 cursor-pointer items-center justify-center rounded-full border-[1.5px] border-zinc-300 bg-background text-sm font-semibold hover:border-zinc-400 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {getInitials(user.name)}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-1 p-2">
        <div className="flex flex-col gap-0.5 px-2.5 pt-1.5 pb-2.5">
          <span className="truncate text-[15px] font-semibold">{user.name}</span>
          <span className="truncate text-[13px] text-muted-foreground">{user.email}</span>
          {user.provider === "google" && (
            <span className="mt-1 w-fit rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">Conectado con Google</span>
          )}
        </div>
        <Link href="/my-tickets" className={ITEM_CLASS} onClick={() => setIsOpen(false)}>
          <Ticket className="size-4" aria-hidden="true" />
          Mis entradas
        </Link>
        <Link href="/organizer" className={ITEM_CLASS} onClick={() => setIsOpen(false)}>
          <LayoutDashboard className="size-4" aria-hidden="true" />
          Panel de organizador
        </Link>
        <button
          type="button"
          className={ITEM_CLASS}
          onClick={() => {
            setIsOpen(false);
            logout();
            router.push("/");
          }}
        >
          <LogOut className="size-4" aria-hidden="true" />
          Cerrar sesión
        </button>
      </PopoverContent>
    </Popover>
  );
}
