"use client";

import { useMemo, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { CircleCheck, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { createVenueAction, updateVenueAction } from "@/modules/venue/actions";
import { getVenueErrors } from "@/modules/venue/venue.schema";
import { EMPTY_VENUE_FORM_VALUES } from "@/modules/venue/venue.utils";
import type { VenueFormValues } from "@/modules/venue/venue.types";

interface VenueFormProps {
  /** The venue to edit; omit to create a new one (then it redirects to the venue page). */
  venue?: { id: string; values: VenueFormValues };
  /** Shows the values without letting them change. */
  readOnly?: boolean;
  /** Why the form is read-only; read by the fields and shown to everyone. */
  reason?: string;
}

const FIELD_CLASS = "h-[52px] rounded-[14px] border-zinc-300 bg-background px-4 text-base read-only:bg-muted/50 md:text-[15px]";

/** Focus order for the first invalid field. */
const FIELD_ORDER = ["name", "address", "city", "lat", "lng"] as const;
type FieldName = (typeof FIELD_ORDER)[number];

const REASON_ID = "venue-form-reason";
const fieldId = (field: FieldName) => `venue-${field}`;

/**
 * Basic data of a venue (name, address, city, lat/lng). Validates live with the
 * same schema as the server; errors show once a field was left or a save was tried.
 */
export function VenueForm({ venue, readOnly = false, reason }: VenueFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<VenueFormValues>(venue?.values ?? EMPTY_VENUE_FORM_VALUES);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [attempted, setAttempted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  const allErrors = useMemo(() => getVenueErrors(values), [values]);
  const errors = Object.fromEntries(FIELD_ORDER.filter((field) => attempted || touched[field]).map((field) => [field, allErrors[field]]));

  function bind(field: FieldName) {
    const error = errors[field];
    const describedBy = [error ? `${fieldId(field)}-error` : null, readOnly && reason ? REASON_ID : null].filter(Boolean).join(" ");
    return {
      id: fieldId(field),
      name: field,
      value: values[field],
      readOnly,
      "aria-invalid": error ? true : undefined,
      "aria-describedby": describedBy || undefined,
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        setValues((previous) => ({ ...previous, [field]: event.target.value }));
        setSaved(false);
      },
      onBlur: () => setTouched((previous) => ({ ...previous, [field]: true })),
    };
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || isPending) return;

    setAttempted(true);
    const firstInvalid = FIELD_ORDER.find((field) => allErrors[field]);
    if (firstInvalid) {
      document.getElementById(fieldId(firstInvalid))?.focus();
      return;
    }

    setSubmitError(null);
    setSaved(false);
    startTransition(async () => {
      if (venue) {
        const result = await updateVenueAction({ id: venue.id, ...values });
        if (result.ok) {
          setSaved(true);
          router.refresh();
        } else {
          setSubmitError(result.error);
        }
        return;
      }

      const result = await createVenueAction(values);
      if (result.ok) router.push(`/organizer/venues/${result.data.id}`);
      else setSubmitError(result.error);
    });
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      aria-label={venue ? "Datos del recinto" : "Nuevo recinto"}
      className="flex flex-col gap-4 rounded-[20px] border border-border bg-card px-4 py-5 lg:gap-5 lg:rounded-3xl lg:p-7"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold lg:text-xl">Datos del recinto</h2>
        {!readOnly && (
          <p className="text-[13px] text-muted-foreground lg:text-sm">
            Los campos con{" "}
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
            <span className="sr-only">asterisco</span> son obligatorios. La latitud y la longitud son opcionales, pero van juntas.
          </p>
        )}
      </div>

      {readOnly && reason && (
        <p
          id={REASON_ID}
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900"
        >
          <Lock className="size-5 shrink-0" aria-hidden="true" />
          {reason}
        </p>
      )}

      <FormField id={fieldId("name")} label="Nombre" error={errors.name} required={!readOnly}>
        <Input {...bind("name")} aria-required={!readOnly} autoComplete="off" placeholder="Ej. Estadio Nacional" className={FIELD_CLASS} />
      </FormField>
      <FormField id={fieldId("address")} label="Dirección" error={errors.address} required={!readOnly}>
        <Input
          {...bind("address")}
          aria-required={!readOnly}
          autoComplete="off"
          placeholder="Ej. Av. José Díaz s/n"
          className={FIELD_CLASS}
        />
      </FormField>
      <FormField id={fieldId("city")} label="Ciudad" error={errors.city} required={!readOnly}>
        <Input {...bind("city")} aria-required={!readOnly} autoComplete="off" placeholder="Ej. Lima" className={FIELD_CLASS} />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField id={fieldId("lat")} label="Latitud" error={errors.lat} required={false}>
          <Input {...bind("lat")} inputMode="decimal" autoComplete="off" placeholder="Ej. -12.0464" className={FIELD_CLASS} />
        </FormField>
        <FormField id={fieldId("lng")} label="Longitud" error={errors.lng} required={false}>
          <Input {...bind("lng")} inputMode="decimal" autoComplete="off" placeholder="Ej. -77.0428" className={FIELD_CLASS} />
        </FormField>
      </div>

      {submitError && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {submitError}
        </p>
      )}
      {saved && (
        <p role="status" className="flex items-center gap-2 text-sm font-medium text-green-800">
          <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
          Guardamos los cambios.
        </p>
      )}

      {!readOnly && (
        <div className="flex">
          <Button type="submit" disabled={isPending} className="h-11 cursor-pointer rounded-xl px-6 text-sm font-semibold">
            {isPending ? "Guardando…" : venue ? "Guardar cambios" : "Crear recinto"}
          </Button>
        </div>
      )}
    </form>
  );
}
