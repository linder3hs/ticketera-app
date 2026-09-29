"use client";

import { useState } from "react";
import { Menu } from "lucide-react";

import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const NAV_LINKS = [
  { href: "/events", label: "Eventos" },
  { href: "/#categorias", label: "Categorías" },
  { href: "/#como-funciona", label: "Cómo funciona" },
];

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:h-[76px] md:px-6">
      <Logo />

      <nav aria-label="Principal" className="hidden items-center gap-9 md:flex">
        {NAV_LINKS.map((link) => (
          <a
            key={link.href}
            href={link.href}
            className="rounded-lg text-[15px] font-medium text-zinc-700 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {link.label}
          </a>
        ))}
      </nav>

      <div className="hidden items-center gap-2 md:flex">
        <Button variant="ghost" className="h-11 cursor-pointer rounded-xl px-4 text-[15px]">
          Iniciar sesión
        </Button>
        <Button
          variant="outline"
          className="h-11 cursor-pointer rounded-xl border-zinc-300 px-4 text-[15px] font-semibold"
        >
          Vender entradas
        </Button>
      </div>

      <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
        <SheetTrigger
          aria-label="Abrir menú"
          render={
            <Button variant="ghost" size="icon" className="size-11 cursor-pointer md:hidden" />
          }
        >
          <Menu className="size-5" />
        </SheetTrigger>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>Ticketera</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-4 px-4">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setIsMenuOpen(false)}
                className="rounded-lg text-base font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {link.label}
              </a>
            ))}
            <Button
              variant="ghost"
              className="h-11 cursor-pointer justify-start"
              onClick={() => setIsMenuOpen(false)}
            >
              Iniciar sesión
            </Button>
            <Button
              variant="outline"
              className="h-11 cursor-pointer justify-start"
              onClick={() => setIsMenuOpen(false)}
            >
              Vender entradas
            </Button>
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
}
