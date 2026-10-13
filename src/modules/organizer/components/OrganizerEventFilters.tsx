"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { EventListQuery } from "@/modules/event/event-list.types";
import { STATUS_LABEL } from "@/modules/organizer/components/OrganizerEventRow";

export type EventFilters = Pick<EventListQuery, "q" | "status" | "dateFrom" | "dateTo">;

export const NO_FILTERS: EventFilters = { q: "" };

const SEARCH_DELAY_MS = 300;
const STATUS_ITEMS = { all: "Todos", ...STATUS_LABEL };
const CONTROL_CLASS = "h-11 w-full rounded-xl";

interface OrganizerEventFiltersProps {
  filters: EventFilters;
  onChange: (filters: EventFilters) => void;
}

/** Name search, status and day range of the organizer's events. */
export function OrganizerEventFilters({ filters, onChange }: OrganizerEventFiltersProps) {
  const [term, setTerm] = useState(filters.q);
  const [syncedQ, setSyncedQ] = useState(filters.q);
  // "Limpiar" resets `filters.q` from outside: adopt it; the echo of our own debounced update is ignored.
  if (filters.q !== syncedQ) {
    setSyncedQ(filters.q);
    setTerm(filters.q);
  }

  useEffect(() => {
    const next = term.trim();
    if (next === syncedQ) return;
    const timer = setTimeout(() => {
      setSyncedQ(next);
      onChange({ ...filters, q: next });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [term, syncedQ, filters, onChange]);

  const hasFilters = Boolean(filters.q || filters.status || filters.dateFrom || filters.dateTo);
  const set = (patch: Partial<EventFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className="flex flex-wrap items-end gap-3">
      <FormField id="events-search" label="Nombre" required={false} className="min-w-[220px] flex-[2_1_240px]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id="events-search"
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Buscar por nombre"
            className="h-11 rounded-xl pl-11"
          />
        </div>
      </FormField>

      <FormField id="events-status" label="Estado" required={false} className="min-w-[150px] flex-[1_1_160px]">
        <Select
          value={filters.status ?? "all"}
          items={STATUS_ITEMS}
          onValueChange={(next) => set({ status: next === "all" ? undefined : (next as EventFilters["status"]) })}
        >
          <SelectTrigger id="events-status" className={CONTROL_CLASS}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_ITEMS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField id="events-from" label="Desde" required={false} className="min-w-[150px] flex-[1_1_160px]">
        <DatePicker
          id="events-from"
          value={filters.dateFrom ?? ""}
          max={filters.dateTo}
          placeholder="Cualquier día"
          clearable
          onChange={(day) => set({ dateFrom: day || undefined })}
          className={CONTROL_CLASS}
        />
      </FormField>

      <FormField id="events-to" label="Hasta" required={false} className="min-w-[150px] flex-[1_1_160px]">
        <DatePicker
          id="events-to"
          value={filters.dateTo ?? ""}
          min={filters.dateFrom}
          placeholder="Cualquier día"
          clearable
          onChange={(day) => set({ dateTo: day || undefined })}
          className={CONTROL_CLASS}
        />
      </FormField>

      {/* Always rendered (disabled when idle) so the fields don't jump when the first filter is set. */}
      <Button
        type="button"
        variant="outline"
        disabled={!hasFilters}
        onClick={() => onChange(NO_FILTERS)}
        className="h-11 cursor-pointer rounded-xl px-4"
      >
        <X className="size-4" aria-hidden="true" />
        Limpiar
      </Button>
    </div>
  );
}
