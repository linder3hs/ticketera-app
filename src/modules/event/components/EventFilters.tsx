"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { EMPTY_FILTERS, PRICE_RANGES } from "@/modules/event/event-search";
import { useEventSearchParams } from "@/modules/event/hooks/use-event-search-params";
import type { EventCategory, EventSearchFilters } from "@/modules/event/event.types";

interface EventFiltersProps {
  categories: EventCategory[];
  cities: string[];
  months: { key: string; label: string }[];
  counts: { categories: Record<string, number>; cities: Record<string, number> };
  resultCount: number;
}

const LEGEND_CLASS = "mb-2 text-[15px] font-semibold";
const OPTION_CLASS =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg text-[15px] has-focus-visible:ring-3 has-focus-visible:ring-ring/50";
const INPUT_CLASS = "size-[18px] shrink-0 cursor-pointer accent-primary";

function toggle(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** The four filter groups; `idPrefix` keeps radio names unique per instance. */
function FilterFields({
  filters,
  onChange,
  idPrefix,
  categories,
  cities,
  months,
  counts,
}: Omit<EventFiltersProps, "resultCount"> & {
  filters: EventSearchFilters;
  onChange: (next: EventSearchFilters) => void;
  idPrefix: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <fieldset>
        <legend className={LEGEND_CLASS}>Categoría</legend>
        {categories.map((category) => (
          <label key={category.id} className={OPTION_CLASS}>
            <input
              type="checkbox"
              className={INPUT_CLASS}
              checked={filters.categories.includes(category.id)}
              onChange={() => onChange({ ...filters, categories: toggle(filters.categories, category.id) })}
            />
            <span className="flex-1">{category.label}</span>
            <span className="text-[13px] text-muted-foreground tabular-nums">
              {counts.categories[category.id] ?? 0}
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend className={LEGEND_CLASS}>Ciudad</legend>
        {cities.map((city) => (
          <label key={city} className={OPTION_CLASS}>
            <input
              type="checkbox"
              className={INPUT_CLASS}
              checked={filters.cities.includes(city)}
              onChange={() => onChange({ ...filters, cities: toggle(filters.cities, city) })}
            />
            <span className="flex-1">{city}</span>
            <span className="text-[13px] text-muted-foreground tabular-nums">{counts.cities[city] ?? 0}</span>
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend className={LEGEND_CLASS}>Fecha</legend>
        {[{ key: null, label: "Cualquier fecha" }, ...months].map((month) => (
          <label key={month.key ?? "any"} className={OPTION_CLASS}>
            <input
              type="radio"
              name={`${idPrefix}-month`}
              className={INPUT_CLASS}
              checked={filters.month === month.key}
              onChange={() => onChange({ ...filters, month: month.key })}
            />
            {month.label}
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend className={LEGEND_CLASS}>Precio desde</legend>
        {[{ key: null, label: "Cualquier precio" }, ...PRICE_RANGES].map((range) => (
          <label key={range.key ?? "any"} className={OPTION_CLASS}>
            <input
              type="radio"
              name={`${idPrefix}-price`}
              className={INPUT_CLASS}
              checked={filters.price === range.key}
              onChange={() => onChange({ ...filters, price: range.key })}
            />
            {range.label}
          </label>
        ))}
      </fieldset>
    </div>
  );
}

/** How many filters (not search text or order) are active. */
function countActive(filters: EventSearchFilters) {
  return (
    filters.categories.length +
    filters.cities.length +
    Number(Boolean(filters.month)) +
    Number(Boolean(filters.price)) +
    Number(Boolean(filters.from))
  );
}

/**
 * Search filters, applied to the URL on every change. A side column from
 * `lg`; below it, a quick category row plus a full-screen sheet.
 */
export function EventFilters(props: EventFiltersProps) {
  const { filters, setFilters } = useEventSearchParams();
  const [isOpen, setIsOpen] = useState(false);
  const activeCount = countActive(filters);
  const clearFilters = () => setFilters({ ...EMPTY_FILTERS, q: filters.q, sort: filters.sort });

  return (
    <>
      <aside aria-label="Filtros" className="hidden lg:block">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <SlidersHorizontal className="size-[18px]" aria-hidden="true" />
            Filtros
          </h2>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="h-11 cursor-pointer rounded-lg px-2 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Limpiar
            </button>
          )}
        </div>
        <FilterFields {...props} filters={filters} onChange={setFilters} idPrefix="aside" />
      </aside>

      <div className="flex flex-col gap-3 lg:hidden">
        <div className="scroll-row gap-2">
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger
              render={
                <button
                  type="button"
                  className="flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full border-[1.5px] border-foreground bg-background px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              }
            >
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Filtros
              {activeCount > 0 && (
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[11px] text-primary-foreground">
                  {activeCount}
                </span>
              )}
            </SheetTrigger>
            <SheetContent side="bottom" className="gap-0 data-[side=bottom]:h-dvh">
              <SheetHeader className="border-b border-border px-4 py-4">
                <SheetTitle className="text-lg">Filtros</SheetTitle>
              </SheetHeader>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
                <FilterFields {...props} filters={filters} onChange={setFilters} idPrefix="sheet" />
              </div>
              <SheetFooter className="flex-row border-t border-border px-4 pt-3 pb-5">
                <Button
                  variant="outline"
                  onClick={clearFilters}
                  disabled={activeCount === 0}
                  className="h-[52px] cursor-pointer rounded-[15px] px-5 text-[15px] font-semibold"
                >
                  Limpiar
                </Button>
                <Button
                  variant="cta"
                  onClick={() => setIsOpen(false)}
                  className="h-[52px] flex-1 cursor-pointer rounded-[15px] text-[15px] font-semibold"
                >
                  Ver {props.resultCount} {props.resultCount === 1 ? "resultado" : "resultados"}
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>

          {props.categories.map((category) => {
            const isSelected = filters.categories.includes(category.id);
            return (
              <button
                key={category.id}
                type="button"
                aria-pressed={isSelected}
                onClick={() => setFilters({ ...filters, categories: toggle(filters.categories, category.id) })}
                className={cn(
                  "flex h-11 shrink-0 cursor-pointer items-center rounded-full border-[1.5px] px-4 text-sm whitespace-nowrap focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  isSelected
                    ? "border-foreground bg-foreground font-semibold text-background"
                    : "border-zinc-300 bg-background font-medium",
                )}
              >
                {category.label}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
