import Link from "next/link";
import {
  Film,
  Mic2,
  Music,
  Palette,
  PartyPopper,
  Theater,
  Trophy,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { EventCategory } from "@/modules/event/event.types";

/**
 * Maps the `icon` string from the mock category data to its lucide icon and
 * a soft tint (same lightness, different hue) so categories scan at a glance.
 */
const CATEGORY_STYLES: Record<string, { Icon: LucideIcon; tone: string }> = {
  Music: { Icon: Music, tone: "bg-indigo-50 text-indigo-700" },
  Trophy: { Icon: Trophy, tone: "bg-green-50 text-green-700" },
  Theater: { Icon: Theater, tone: "bg-rose-50 text-rose-700" },
  PartyPopper: { Icon: PartyPopper, tone: "bg-orange-50 text-orange-700" },
  Users: { Icon: Users, tone: "bg-cyan-50 text-cyan-700" },
  Film: { Icon: Film, tone: "bg-violet-50 text-violet-700" },
  Mic2: { Icon: Mic2, tone: "bg-yellow-50 text-yellow-700" },
  Palette: { Icon: Palette, tone: "bg-fuchsia-50 text-fuchsia-700" },
};

interface CategoryCardProps {
  category: EventCategory;
  isSelected: boolean;
}

/**
 * Category tile that filters the upcoming events via `?categoria=<id>`.
 * Clicking the selected tile again clears the filter.
 */
export function CategoryCard({ category, isSelected }: CategoryCardProps) {
  const style = CATEGORY_STYLES[category.icon];

  return (
    <Link
      href={isSelected ? "/#eventos" : `/?categoria=${category.id}#eventos`}
      aria-current={isSelected ? "true" : undefined}
      className={cn(
        "flex h-[132px] w-[136px] shrink-0 snap-start flex-col items-start justify-between rounded-[22px] border-2 p-4 transition duration-200 hover:shadow-[0_14px_28px_-18px_rgba(24,24,27,0.4)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 motion-safe:hover:-translate-y-0.5 lg:h-[168px] lg:w-auto lg:rounded-3xl lg:p-5",
        style?.tone ?? "bg-muted text-foreground",
        isSelected ? "border-primary" : "border-transparent",
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-white lg:size-14 lg:rounded-[18px]">
        {style ? <style.Icon className="size-6 lg:size-[26px]" aria-hidden="true" /> : null}
      </span>
      <span className="text-sm leading-tight font-semibold text-foreground lg:text-base">
        {category.label}
      </span>
    </Link>
  );
}
