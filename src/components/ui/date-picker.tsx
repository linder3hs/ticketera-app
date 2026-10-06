"use client"

import * as React from "react"
import { es } from "date-fns/locale"
import { CalendarIcon, XIcon } from "lucide-react"

import { cn, fromIsoDay, toIsoDay } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface DatePickerProps
  extends Omit<React.ComponentProps<"button">, "value" | "onChange" | "type"> {
  /** `YYYY-MM-DD`, or empty for no date. */
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Earliest / latest selectable day (`YYYY-MM-DD`). */
  min?: string
  max?: string
  /** Shows a clear button when there is a value. */
  clearable?: boolean
}

/** Day picker: the shadcn `Calendar` in a popover, with a trigger that matches `Input`. Height comes from `className`. */
function DatePicker({
  value,
  onChange,
  placeholder = "Elige una fecha",
  min,
  max,
  clearable = false,
  className,
  disabled,
  ...props
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const selected = fromIsoDay(value)
  const from = fromIsoDay(min)
  const to = fromIsoDay(max)

  return (
    <div className="relative">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={disabled}
          render={
            <button
              type="button"
              data-slot="date-picker"
              data-empty={selected ? undefined : ""}
              className={cn(
                "flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-input bg-transparent px-2.5 text-left text-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[empty]:text-muted-foreground dark:bg-input/30",
                clearable && selected && "pr-9",
                className
              )}
              {...props}
            />
          }
        >
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="truncate">
            {selected
              ? selected.toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric" })
              : placeholder}
          </span>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={(day) => {
              onChange(day ? toIsoDay(day) : "")
              setOpen(false)
            }}
            disabled={[...(from ? [{ before: from }] : []), ...(to ? [{ after: to }] : [])]}
            locale={es}
          />
        </PopoverContent>
      </Popover>
      {clearable && selected && !disabled && (
        <button
          type="button"
          aria-label="Quitar fecha"
          onClick={() => onChange("")}
          className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <XIcon className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

export { DatePicker }
