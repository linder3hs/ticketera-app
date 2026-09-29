"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, CalendarDays, LayoutDashboard, LogOut, Menu, Settings, Ticket } from "lucide-react";

import { cn } from "@/lib/utils";
import { usePersistHydration } from "@/lib/use-persist-hydration";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuthStore } from "@/modules/auth/auth.store";

type Section = "summary" | "events";

const NAV = [
  { key: "summary", label: "Resumen", href: "/organizer", icon: LayoutDashboard },
  // Not built yet (spec: next phases): they point back to the summary.
  { key: "events", label: "Mis eventos", href: "/organizer", icon: CalendarDays },
  { key: "sales", label: "Ventas", href: "/organizer", icon: BarChart3 },
  { key: "settings", label: "Configuración", href: "/organizer", icon: Settings },
] as const;

function Brand() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 rounded-lg px-2 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex size-9 items-center justify-center rounded-[11px] bg-primary text-primary-foreground">
        <Ticket className="size-5" aria-hidden="true" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[19px] font-bold tracking-tight">Ticketera</span>
        <span className="text-xs font-medium text-muted-foreground">Organizadores</span>
      </span>
    </Link>
  );
}

function Nav({ active, onNavigate }: { active: Section; onNavigate?: () => void }) {
  return (
    <nav aria-label="Panel" className="flex flex-col gap-1">
      {NAV.map(({ key, label, href, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          onClick={onNavigate}
          aria-current={key === active ? "page" : undefined}
          className={cn(
            "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            key === active ? "bg-indigo-50 font-semibold text-indigo-800" : "font-medium text-zinc-700 hover:bg-muted",
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </nav>
  );
}

function Account() {
  const router = useRouter();
  const hydrated = usePersistHydration(useAuthStore);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  return (
    <div className="flex items-center justify-between gap-2 rounded-2xl bg-muted py-2 pr-1.5 pl-3">
      <span className="min-w-0 truncate text-sm font-semibold">{hydrated && user ? user.name : "Organizador demo"}</span>
      <button
        type="button"
        aria-label="Cerrar sesión"
        onClick={() => {
          logout();
          router.push("/");
        }}
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <LogOut className="size-[18px]" aria-hidden="true" />
      </button>
    </div>
  );
}

/** Organizer layout: side navigation from `lg`, a header with a menu sheet below. */
export function OrganizerShell({ active, children }: { active: Section; children: ReactNode }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="flex min-h-full bg-muted">
      <aside className="sticky top-0 hidden h-dvh w-[260px] shrink-0 flex-col gap-7 border-r border-border bg-background px-4 py-6 lg:flex">
        <Brand />
        <Nav active={active} />
        <div className="flex-1" />
        <Account />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-zinc-100 bg-background pr-3 pl-2 lg:hidden">
          <Brand />
          <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <SheetTrigger
              aria-label="Abrir menú del panel"
              className="flex size-11 cursor-pointer items-center justify-center rounded-xl hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Menu className="size-[22px]" aria-hidden="true" />
            </SheetTrigger>
            <SheetContent side="right" className="gap-6 px-4">
              <SheetHeader className="px-0">
                <SheetTitle>Panel de organizador</SheetTitle>
              </SheetHeader>
              <Nav active={active} onNavigate={() => setIsMenuOpen(false)} />
              <div className="mt-auto pb-6">
                <Account />
              </div>
            </SheetContent>
          </Sheet>
        </header>
        <main className="flex-1 px-4 pt-6 pb-10 md:px-8 lg:px-12 lg:pt-10 lg:pb-16">{children}</main>
      </div>
    </div>
  );
}
