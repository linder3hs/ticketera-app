"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Ticket } from "lucide-react";

import { Logo } from "@/components/Logo";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { usePersistHydration } from "@/lib/use-persist-hydration";
import { useAuthStore } from "@/modules/auth/auth.store";
import { AccountMenu } from "@/modules/auth/components/AccountMenu";

const NAV_LINKS = [
  { href: "/events", label: "Eventos" },
  { href: "/#categorias", label: "Categorías" },
  { href: "/#como-funciona", label: "Cómo funciona" },
];

const SHEET_LINK_CLASS =
  "flex h-11 items-center rounded-lg px-2.5 text-base font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const hydrated = usePersistHydration(useAuthStore);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  // Before the saved session loads, render neither state to avoid a flash.
  const session = hydrated ? user : undefined;
  const closeMenu = () => setIsMenuOpen(false);

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

      <div className="hidden min-w-[260px] items-center justify-end gap-2 md:flex">
        {session === null && (
          <>
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "ghost" }), "h-11 rounded-xl px-4 text-[15px]")}
            >
              Iniciar sesión
            </Link>
            <Link
              href="/organizer"
              className={cn(
                buttonVariants({ variant: "outline" }),
                "h-11 rounded-xl border-zinc-300 px-4 text-[15px] font-semibold",
              )}
            >
              Vender entradas
            </Link>
          </>
        )}
        {session && (
          <>
            <Link
              href="/my-tickets"
              aria-current={pathname === "/my-tickets" ? "page" : undefined}
              className="flex h-11 items-center gap-2 rounded-xl px-4 text-[15px] font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-indigo-50 aria-[current=page]:text-indigo-800"
            >
              <Ticket className="size-[18px]" aria-hidden="true" />
              Mis entradas
            </Link>
            <AccountMenu user={session} />
          </>
        )}
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
            <div className="mt-2 flex flex-col gap-1 border-t border-border pt-4">
              {session ? (
                <>
                  <p className="px-2.5 pb-2 text-sm text-muted-foreground">
                    <span className="block font-semibold text-foreground">{session.name}</span>
                    {session.email}
                  </p>
                  <Link href="/my-tickets" onClick={closeMenu} className={SHEET_LINK_CLASS}>
                    Mis entradas
                  </Link>
                  <Link href="/organizer" onClick={closeMenu} className={SHEET_LINK_CLASS}>
                    Panel de organizador
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      closeMenu();
                      logout();
                      router.push("/");
                    }}
                    className={cn(SHEET_LINK_CLASS, "cursor-pointer text-left")}
                  >
                    Cerrar sesión
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" onClick={closeMenu} className={SHEET_LINK_CLASS}>
                    Iniciar sesión
                  </Link>
                  <Link href="/organizer" onClick={closeMenu} className={SHEET_LINK_CLASS}>
                    Vender entradas
                  </Link>
                </>
              )}
            </div>
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
}
