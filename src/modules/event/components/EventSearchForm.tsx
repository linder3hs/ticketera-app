"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { es } from "date-fns/locale";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PRICE_RANGES = [
  { value: "any", label: "Cualquier precio" },
  { value: "under-50", label: "Hasta S/ 50" },
  { value: "50-150", label: "S/ 50 – 150" },
  { value: "150-300", label: "S/ 150 – 300" },
  { value: "over-300", label: "Más de S/ 300" },
];

const FIELD_CLASS =
  "flex flex-col items-start justify-center gap-0.5 rounded-2xl px-4 py-2 text-left";
const FIELD_LABEL_CLASS = "text-xs font-semibold text-foreground";

export function EventSearchForm() {
  // Buscador mock: sin acción real todavía (ver docs/specs/landing-hero-topbar-categories.md).
  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  const [date, setDate] = useState<Date | undefined>(undefined);
  const [isDateOpen, setIsDateOpen] = useState(false);

  return (
    <form
      role="search"
      onSubmit={handleSearchSubmit}
      className="flex w-full flex-col gap-1 rounded-[22px] border border-border bg-background p-2 shadow-[0_12px_32px_-16px_rgba(24,24,27,0.22)] md:flex-row md:items-stretch md:gap-0 md:divide-x md:divide-border lg:w-[680px] lg:shrink-0"
    >
      <label className={`${FIELD_CLASS} flex-1 cursor-text focus-within:bg-muted focus-within:ring-3 focus-within:ring-ring/50`}>
        <span className={FIELD_LABEL_CLASS}>Qué quieres ver</span>
        <input
          type="search"
          placeholder="Artista, evento o ciudad"
          className="w-full bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none"
        />
      </label>

      <Popover open={isDateOpen} onOpenChange={setIsDateOpen}>
        <PopoverTrigger
          render={
            <button
              type="button"
              className={`${FIELD_CLASS} cursor-pointer hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:w-36`}
            />
          }
        >
          <span className={FIELD_LABEL_CLASS}>Fecha</span>
          <span className="text-[15px] text-muted-foreground">
            {date
              ? date.toLocaleDateString("es-PE", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "Cualquier día"}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={(selected) => {
              setDate(selected);
              setIsDateOpen(false);
            }}
            locale={es}
          />
        </PopoverContent>
      </Popover>

      <Select defaultValue="any" items={PRICE_RANGES}>
        <SelectTrigger
          className={`${FIELD_CLASS} w-full cursor-pointer border-0 hover:bg-muted data-[size=default]:h-auto md:w-40 [&>svg]:hidden`}
        >
          <span className={FIELD_LABEL_CLASS}>Precio</span>
          <SelectValue className="text-[15px] text-muted-foreground" />
        </SelectTrigger>
        <SelectContent>
          {PRICE_RANGES.map((range) => (
            <SelectItem key={range.value} value={range.value}>
              {range.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="submit"
        variant="cta"
        className="h-12 cursor-pointer gap-2 rounded-2xl px-6 text-[15px] font-semibold md:ml-2 md:h-auto md:border-l-0"
      >
        <Search className="size-[18px]" aria-hidden="true" />
        Buscar
      </Button>
    </form>
  );
}
