import { Plus, Trash2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { getCapacity } from "@/modules/organizer/create-event.schema";
import type { TicketTypeInput } from "@/modules/organizer/organizer.types";

interface TicketTypesEditorProps {
  value: TicketTypeInput[];
  /** Errors keyed "ticketTypes.<index>.<field>". */
  errors: Record<string, string>;
  onChange: (value: TicketTypeInput[]) => void;
}

const FIELD_CLASS = "h-[52px] rounded-[14px] border-zinc-300 bg-background px-4 text-base md:text-[15px]";
const COLUMNS = "sm:grid-cols-[minmax(0,1fr)_130px_130px_44px]";

const number = new Intl.NumberFormat("es-PE");

export const ticketFieldId = (index: number, field: keyof TicketTypeInput) => `ticketTypes-${index}-${field}`;

/** Rows of name, price and quantity per ticket type; at least one row. */
export function TicketTypesEditor({ value, errors, onChange }: TicketTypesEditorProps) {
  function update(index: number, field: keyof TicketTypeInput, text: string) {
    onChange(value.map((type, i) => (i === index ? { ...type, [field]: text } : type)));
  }

  const fields: { key: keyof TicketTypeInput; label: string; props: Record<string, string> }[] = [
    { key: "name", label: "Nombre", props: { placeholder: "Ej. General" } },
    { key: "price", label: "Precio (S/)", props: { inputMode: "decimal", placeholder: "0" } },
    { key: "quantity", label: "Cantidad", props: { inputMode: "numeric", placeholder: "0" } },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div aria-hidden="true" className={`hidden gap-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:grid ${COLUMNS}`}>
        {fields.map((field) => (
          <span key={field.key}>
            {field.label}
            <span className="text-destructive"> *</span>
          </span>
        ))}
        <span />
      </div>

      <ul className="flex flex-col gap-3">
        {value.map((type, index) => {
          const rowErrors = fields.map((field) => errors[`ticketTypes.${index}.${field.key}`]).filter(Boolean);
          return (
            <li key={index} className="flex flex-col gap-1.5 rounded-2xl border border-border p-3 sm:border-0 sm:p-0">
              <div className={`grid grid-cols-2 gap-2.5 sm:gap-3 ${COLUMNS}`}>
                {fields.map((field) => {
                  const id = ticketFieldId(index, field.key);
                  const error = errors[`ticketTypes.${index}.${field.key}`];
                  return (
                    <div key={field.key} className={field.key === "name" ? "col-span-2 sm:col-span-1" : undefined}>
                      <label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted-foreground sm:sr-only">
                        {field.label} del tipo {index + 1}
                      </label>
                      <Input
                        id={id}
                        {...field.props}
                        aria-required
                        aria-invalid={error ? true : undefined}
                        aria-describedby={error ? `ticketTypes-${index}-errors` : undefined}
                        value={type[field.key]}
                        onChange={(event) => update(index, field.key, event.target.value)}
                        className={FIELD_CLASS}
                      />
                    </div>
                  );
                })}
                <button
                  type="button"
                  aria-label={`Quitar tipo de entrada ${index + 1}`}
                  disabled={value.length === 1}
                  onClick={() => onChange(value.filter((_, i) => i !== index))}
                  className="col-span-2 flex h-11 cursor-pointer items-center justify-center gap-2 self-center rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-1 sm:size-11"
                >
                  <Trash2 className="size-[18px]" aria-hidden="true" />
                  <span className="sm:hidden">Quitar</span>
                </button>
              </div>
              {rowErrors.length > 0 && (
                <p id={`ticketTypes-${index}-errors`} className="text-[13px] font-medium text-destructive">
                  {rowErrors.join(" ")}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => onChange([...value, { name: "", price: "", quantity: "" }])}
        className="flex h-11 w-fit cursor-pointer items-center gap-2 rounded-xl border-[1.5px] border-dashed border-zinc-400 px-4 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Plus className="size-4" aria-hidden="true" />
        Agregar tipo de entrada
      </button>

      <p className="flex items-center justify-between border-t border-zinc-100 pt-3 text-sm">
        <span className="text-muted-foreground">Capacidad total</span>
        <strong className="font-semibold tabular-nums">{number.format(getCapacity(value))} entradas</strong>
      </p>
    </div>
  );
}
