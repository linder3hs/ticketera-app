import { BarChart3, LayoutDashboard, Settings, Users } from "lucide-react";

import type { PanelNavSection } from "@/modules/panel/panel.types";
import { hasRole } from "@/modules/user/user.permissions";
import type { Role } from "@/modules/user/user.types";

interface SectionConfig extends PanelNavSection {
  minRole: Role;
}

// Only pages that exist today; add an item here when its route is built.
const SECTIONS: readonly SectionConfig[] = [
  {
    label: "Administración",
    minRole: "admin",
    items: [
      { href: "/admin/dashboard", label: "Dashboard", icon: BarChart3 },
      { href: "/admin/users", label: "Usuarios", icon: Users },
    ],
  },
  {
    label: "Organizador",
    minRole: "organizer",
    items: [
      { href: "/organizer", label: "Eventos", icon: LayoutDashboard },
      { href: "/organizer/settings", label: "Configuración", icon: Settings },
    ],
  },
];

/** Sections the role may see, in display order (Administración first). */
export function getNavSections(role: Role): PanelNavSection[] {
  return SECTIONS.filter((section) => hasRole(role, section.minRole)).map(({ label, items }) => ({ label, items }));
}

/** The item whose href is the longest match of `pathname`, so `/organizer/events/new` doesn't light up `/organizer`. */
export function getActiveHref(sections: readonly PanelNavSection[], pathname: string): string | undefined {
  return sections
    .flatMap((section) => section.items.map((item) => item.href))
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}
