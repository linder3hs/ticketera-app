import Link from "next/link";

import { cn } from "@/lib/utils";
import type { EventCategory } from "@/modules/event/event.types";

interface CategoryChipsProps {
  categories: EventCategory[];
  selectedId?: string;
}

/** "Todos" + one chip per category; filters via `?categoria=<id>`. */
export function CategoryChips({ categories, selectedId }: CategoryChipsProps) {
  const chips = [
    { id: undefined, label: "Todos", href: "/#eventos" },
    ...categories.map((category) => ({
      id: category.id,
      label: category.label,
      href: `/?categoria=${category.id}#eventos`,
    })),
  ];

  return (
    <nav
      aria-label="Filtrar por categoría"
      className="scroll-row gap-2 lg:mx-0 lg:flex-wrap lg:gap-2.5 lg:overflow-visible lg:px-0"
    >
      {chips.map((chip) => {
        const isSelected = chip.id === selectedId;
        return (
          <Link
            key={chip.label}
            href={chip.href}
            aria-current={isSelected ? "true" : undefined}
            className={cn(
              "flex h-11 shrink-0 items-center rounded-full border-[1.5px] px-4 text-sm whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:px-[18px]",
              isSelected
                ? "border-foreground bg-foreground font-semibold text-background"
                : "border-zinc-300 bg-background font-medium text-foreground hover:border-zinc-400",
            )}
          >
            {chip.label}
          </Link>
        );
      })}
    </nav>
  );
}
