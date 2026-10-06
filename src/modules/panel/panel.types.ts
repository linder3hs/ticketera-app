import type { LucideIcon } from "lucide-react";

export interface PanelNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface PanelNavSection {
  label: string;
  items: readonly PanelNavItem[];
}

/** Session data the sidebar shows in its account card. */
export interface PanelUser {
  name: string;
  email: string;
  roleLabel: string;
}
