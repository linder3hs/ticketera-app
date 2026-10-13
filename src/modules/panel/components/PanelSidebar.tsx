"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { ArrowUpRight, LogOut, Ticket, User } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { getActiveHref } from "@/modules/panel/panel-nav";
import type { PanelNavSection, PanelUser } from "@/modules/panel/panel.types";

const ITEM_CLASS =
  "flex h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-left text-[15px] font-medium text-zinc-700 hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-[current=page]:bg-indigo-50 aria-[current=page]:font-semibold aria-[current=page]:text-indigo-800";

interface PanelSidebarProps {
  sections: readonly PanelNavSection[];
  user: PanelUser;
  /** Icon-only mode (desktop collapsed). */
  rail?: boolean;
  onNavigate?: () => void;
}

/** Icon + label; the label is hidden in rail mode, so the accessible name is set explicitly. */
function ItemContent({ icon: Icon, label, rail }: { icon: typeof User; label: string; rail: boolean }) {
  return (
    <>
      <Icon className="size-5 shrink-0" aria-hidden="true" />
      <span className={cn("truncate", rail && "sr-only")}>{label}</span>
    </>
  );
}

function ItemLink({ rail, className, ...props }: ComponentProps<typeof Link> & { rail: boolean }) {
  return <Link className={cn(ITEM_CLASS, rail && "justify-center px-0", className)} {...props} />;
}

function Group({ label, rail, children }: { label: string; rail: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p
        className={cn(
          "mb-1.5 px-3 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase",
          rail && "sr-only",
        )}
      >
        {label}
      </p>
      {rail && <div aria-hidden="true" className="mx-3 mb-3 h-px bg-border" />}
      {children}
    </div>
  );
}

/** Brand, role-based navigation and account footer. Shared by the desktop aside and the mobile drawer. */
export function PanelSidebar({ sections, user, rail = false, onNavigate }: PanelSidebarProps) {
  const pathname = usePathname();
  const { signOut } = useClerk();
  const activeHref = getActiveHref(sections, pathname);

  return (
    <div className="flex h-full min-h-0 flex-col px-3 py-4">
      <Link
        href="/"
        aria-label="Ticketera, ir al inicio"
        onClick={onNavigate}
        className={cn(
          "mb-5 flex items-center gap-3 rounded-xl px-3 py-1 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          rail && "justify-center px-0",
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-primary text-primary-foreground">
          <Ticket className="size-5" aria-hidden="true" />
        </span>
        {!rail && <span className="text-xl font-bold tracking-tight">Ticketera</span>}
      </Link>

      <nav aria-label="Panel" className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
        {sections.map((section) => (
          <Group key={section.label} label={section.label} rail={rail}>
            {section.items.map((item) => (
              <ItemLink
                key={item.href}
                href={item.href}
                rail={rail}
                title={rail ? item.label : undefined}
                aria-label={rail ? item.label : undefined}
                aria-current={item.href === activeHref ? "page" : undefined}
                onClick={onNavigate}
              >
                <ItemContent icon={item.icon} label={item.label} rail={rail} />
              </ItemLink>
            ))}
          </Group>
        ))}
      </nav>

      <div className="mt-4 flex flex-col gap-0.5 border-t border-border pt-4">
        <ItemLink
          href="/"
          rail={rail}
          title={rail ? "Ver sitio" : undefined}
          aria-label={rail ? "Ver sitio" : undefined}
          onClick={onNavigate}
        >
          <ItemContent icon={ArrowUpRight} label="Ver sitio" rail={rail} />
        </ItemLink>
        <button
          type="button"
          title={rail ? "Cerrar sesión" : undefined}
          aria-label={rail ? "Cerrar sesión" : undefined}
          onClick={() => signOut({ redirectUrl: "/" })}
          className={cn(ITEM_CLASS, rail && "justify-center px-0")}
        >
          <ItemContent icon={LogOut} label="Cerrar sesión" rail={rail} />
        </button>

        <div className={cn("mt-2 flex items-center gap-3 px-3", rail && "justify-center px-0")} title={user.email}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-800">
            <User className="size-5" aria-hidden="true" />
          </span>
          <div className={cn("min-w-0 leading-tight", rail && "sr-only")}>
            <p className="truncate text-sm font-medium">{user.name}</p>
            <p className="text-xs text-muted-foreground">{user.roleLabel}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
