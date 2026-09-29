"use client";

import { cn } from "@/lib/utils";
import { SORT_OPTIONS } from "@/modules/event/event-search";
import { useEventSearchParams } from "@/modules/event/hooks/use-event-search-params";

/** Segmented "Ordenar por" control. */
export function SortToggle() {
  const { filters, setFilters } = useEventSearchParams();

  return (
    <div className="flex items-center gap-2.5">
      <span id="sort-label" className="hidden text-sm text-muted-foreground sm:inline">
        Ordenar por
      </span>
      <div role="group" aria-labelledby="sort-label" className="flex rounded-xl bg-muted p-1">
        {SORT_OPTIONS.map((option) => {
          const isActive = filters.sort === option.key;
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={isActive}
              onClick={() => setFilters({ ...filters, sort: option.key })}
              className={cn(
                "h-9 cursor-pointer rounded-[9px] px-3 text-[13px] font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                isActive ? "bg-background font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
