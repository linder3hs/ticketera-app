"use client";

import { useMemo, useState, useTransition, type ChangeEvent } from "react";
import { TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { generateSeatsAction } from "@/modules/venue/actions";
import { getSeatGeneratorErrors } from "@/modules/venue/venue.schema";
import type { SeatGeneratorFormValues, ZoneForEdit } from "@/modules/venue/venue.types";
import { EMPTY_SEAT_GENERATOR_FORM_VALUES, MAX_SEATS_PER_GENERATION, rowLabelAt } from "@/modules/venue/venue.utils";

interface SeatGeneratorFormProps {
  /** The numbered zone whose seats are (re)generated. */
  zone: Pick<ZoneForEdit, "id" | "name" | "seatCount">;
  onCancel: () => void;
  /** Runs after the seats were generated, with how many. */
  onDone: (count: number) => void;
}

const FIELD_CLASS = "h-[52px] rounded-[14px] border-zinc-300 bg-background px-4 text-base md:text-[15px]";

const FIELD_ORDER = ["rows", "seatsPerRow", "firstRowLabel", "startNumber"] as const;
type FieldName = (typeof FIELD_ORDER)[number];

const PREVIEW_ID = "seat-generator-preview";
/** Fields that determine the seat count shown in the preview. */
const PREVIEW_FIELDS: readonly FieldName[] = ["rows", "seatsPerRow"];
const fieldId = (field: FieldName) => `seat-generator-${field}`;
const number = new Intl.NumberFormat("es-PE");

const isCount = (value: string) => /^\d+$/.test(value.trim());

/**
 * Parameters of a straight seat grid (rows × seats per row) for a numbered
 * zone. Shows how many seats will exist and that they replace the current ones.
 */
export function SeatGeneratorForm({ zone, onCancel, onDone }: SeatGeneratorFormProps) {
  const [values, setValues] = useState<Required<SeatGeneratorFormValues>>(EMPTY_SEAT_GENERATOR_FORM_VALUES);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [attempted, setAttempted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const allErrors = useMemo(() => getSeatGeneratorErrors(values), [values]);
  const errors = Object.fromEntries(FIELD_ORDER.filter((field) => attempted || touched[field]).map((field) => [field, allErrors[field]]));

  const total = isCount(values.rows) && isCount(values.seatsPerRow) ? Number(values.rows) * Number(values.seatsPerRow) : null;
  const firstRow = values.firstRowLabel.trim() === "" ? "A" : values.firstRowLabel.trim();
  const lastRow = !allErrors.rows && !allErrors.firstRowLabel && total !== null ? rowLabelAt(firstRow, Number(values.rows) - 1) : null;

  function bind(field: FieldName) {
    const error = errors[field];
    const describedBy = [error ? `${fieldId(field)}-error` : null, PREVIEW_FIELDS.includes(field) ? PREVIEW_ID : null].filter(Boolean).join(" ");
    return {
      id: fieldId(field),
      name: field,
      value: values[field],
      "aria-invalid": error ? true : undefined,
      "aria-describedby": describedBy || undefined,
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        const next = field === "firstRowLabel" ? event.target.value.toUpperCase() : event.target.value;
        setValues((previous) => ({ ...previous, [field]: next }));
      },
      onBlur: () => setTouched((previous) => ({ ...previous, [field]: true })),
    };
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;

    setAttempted(true);
    const firstInvalid = FIELD_ORDER.find((field) => allErrors[field]);
    if (firstInvalid) {
      document.getElementById(fieldId(firstInvalid))?.focus();
      return;
    }

    setSubmitError(null);
    startTransition(async () => {
      const result = await generateSeatsAction({ zoneId: zone.id, ...values });
      if (result.ok) onDone(result.data.count);
      else setSubmitError(result.error);
    });
  }

  return (
    <form noValidate onSubmit={handleSubmit} aria-label={`Generar asientos de ${zone.name}`} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField id={fieldId("rows")} label="Filas" error={errors.rows}>
          <Input {...bind("rows")} aria-required inputMode="numeric" autoComplete="off" placeholder="Ej. 10" className={FIELD_CLASS} />
        </FormField>
        <FormField id={fieldId("seatsPerRow")} label="Asientos por fila" error={errors.seatsPerRow}>
          <Input {...bind("seatsPerRow")} aria-required inputMode="numeric" autoComplete="off" placeholder="Ej. 20" className={FIELD_CLASS} />
        </FormField>
        <FormField id={fieldId("firstRowLabel")} label="Primera fila" error={errors.firstRowLabel} required={false}>
          <Input {...bind("firstRowLabel")} maxLength={2} autoComplete="off" placeholder="A" className={FIELD_CLASS} />
        </FormField>
        <FormField id={fieldId("startNumber")} label="Número inicial" error={errors.startNumber} required={false}>
          <Input {...bind("startNumber")} inputMode="numeric" autoComplete="off" placeholder="1" className={FIELD_CLASS} />
        </FormField>
      </div>

      <p id={PREVIEW_ID} role="status" className="rounded-2xl bg-muted px-4 py-3 text-sm">
        {total === null ? (
          <span className="text-muted-foreground">
            Escribe las filas y los asientos por fila para ver cuántos asientos se crean (máximo {number.format(MAX_SEATS_PER_GENERATION)}).
          </span>
        ) : (
          <>
            <span className="font-semibold tabular-nums">
              {number.format(Number(values.rows))} × {number.format(Number(values.seatsPerRow))} = {number.format(total)} {total === 1 ? "asiento" : "asientos"}
            </span>
            {lastRow && (
              <span className="text-muted-foreground">
                {" "}
                · filas {firstRow}
                {lastRow !== firstRow && `–${lastRow}`}
              </span>
            )}
          </>
        )}
      </p>

      <p className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
        <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
        {zone.seatCount > 0
          ? `Esto reemplaza los ${number.format(zone.seatCount)} asientos actuales de la zona.`
          : "La zona todavía no tiene asientos. Si luego los generas de nuevo, se reemplazan."}
      </p>

      {submitError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {submitError}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending} className="h-11 cursor-pointer rounded-xl px-5">
          Cancelar
        </Button>
        <Button type="submit" disabled={isPending} className="h-11 cursor-pointer rounded-xl px-5 font-semibold">
          {isPending ? "Generando…" : "Generar asientos"}
        </Button>
      </div>
    </form>
  );
}
