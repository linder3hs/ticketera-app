"use client";

import { X } from "lucide-react";

import { getActiveFilterChips } from "@/modules/event/event-search";
import { useEventSearchParams } from "@/modules/event/hooks/use-event-search-params";
import type { EventCategory } from "@/modules/event/event.types";

interface ActiveFilterChipsProps {
  categories: EventCategory[];
  months: { key: string; label: string }[];
}

/** One removable chip per active filter (and the search text). */
export function ActiveFilterChips({ categories, months }: ActiveFilterChipsProps) {
  const { filters, setFilters } = useEventSearchParams();
  const chips = getActiveFilterChips(filters, categories, months);
  if (chips.length === 0) return null;

  return (
    <ul aria-label="Filtros activos" className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            aria-label={`Quitar filtro ${chip.label}`}
            onClick={() => setFilters(chip.filters)}
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-indigo-50 pr-2.5 pl-3.5 text-[13px] font-medium text-indigo-900 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {chip.label}
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
