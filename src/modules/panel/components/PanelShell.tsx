"use client";

import { useState, type ReactNode } from "react";
import { Menu, PanelLeft } from "lucide-react";

import { Logo } from "@/components/Logo";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { usePersistHydration } from "@/lib/use-persist-hydration";
import { cn } from "@/lib/utils";
import { PanelSidebar } from "@/modules/panel/components/PanelSidebar";
import { getNavSections } from "@/modules/panel/panel-nav";
import { usePanelStore } from "@/modules/panel/panel.store";
import type { PanelUser } from "@/modules/panel/panel.types";
import type { Role } from "@/modules/user/user.types";

const ICON_BUTTON_CLASS =
  "flex size-11 cursor-pointer items-center justify-center rounded-xl text-zinc-700 hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/** Admin/organizer layout: collapsible sidebar from `lg`, a drawer below. */
export function PanelShell({ role, user, children }: { role: Role; user: PanelUser; children: ReactNode }) {
  // Resolved here, not in the server layout: nav items hold icon components, which can't cross the server/client boundary.
  const sections = getNavSections(role);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const hydrated = usePersistHydration(usePanelStore);
  const persistedCollapsed = usePanelStore((state) => state.collapsed);
  const toggleCollapsed = usePanelStore((state) => state.toggleCollapsed);
  // Until the saved preference loads, render expanded like the server did.
  const rail = hydrated && persistedCollapsed;

  return (
    <div className="flex min-h-full bg-muted">
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 border-r border-border bg-background transition-[width] duration-200 lg:block",
          rail ? "w-[76px]" : "w-[264px]",
        )}
      >
        <PanelSidebar sections={sections} user={user} rail={rail} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center gap-2 border-b border-border bg-background px-2 lg:px-4">
          <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
            <SheetTrigger aria-label="Abrir menú" className={cn(ICON_BUTTON_CLASS, "lg:hidden")}>
              <Menu className="size-[22px]" aria-hidden="true" />
            </SheetTrigger>
            <SheetContent side="left" showCloseButton={false} className="w-[300px] gap-0 p-0 sm:max-w-[300px]">
              <SheetTitle className="sr-only">Menú del panel</SheetTitle>
              <PanelSidebar sections={sections} user={user} onNavigate={() => setIsDrawerOpen(false)} />
            </SheetContent>
          </Sheet>

          <button
            type="button"
            aria-label={rail ? "Expandir menú" : "Contraer menú"}
            aria-expanded={!rail}
            onClick={toggleCollapsed}
            className={cn(ICON_BUTTON_CLASS, "hidden lg:flex")}
          >
            <PanelLeft className="size-5" aria-hidden="true" />
          </button>

          <div className="lg:hidden">
            <Logo />
          </div>
        </header>

        <main className="flex-1 px-4 pt-6 pb-10 md:px-8 lg:px-12 lg:pt-10 lg:pb-16">{children}</main>
      </div>
    </div>
  );
}
