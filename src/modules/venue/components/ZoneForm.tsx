"use client";

import { useMemo, useState, useTransition, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createZoneAction, updateZoneAction } from "@/modules/venue/actions";
import { ZONE_CHANGE_MESSAGES, checkZoneChange } from "@/modules/venue/venue.policy";
import { getZoneErrors } from "@/modules/venue/venue.schema";
import type { SeatingType, ZoneForEdit, ZoneFormValues, ZoneShapeFormValues } from "@/modules/venue/venue.types";
import { EMPTY_ZONE_FORM_VALUES, VENUE_BOUNDS, toZoneFormValues } from "@/modules/venue/venue.utils";

interface ZoneFormProps {
  venueId: string;
  /** The zone to edit; omit to create a new one. */
  zone?: ZoneForEdit;
  onCancel: () => void;
  /** Runs after the zone was saved. */
  onDone: () => void;
}

const FIELD_CLASS = "h-[52px] rounded-[14px] border-zinc-300 bg-background px-4 text-base md:text-[15px]";
const SELECT_CLASS = "h-[52px] w-full rounded-[14px] border-zinc-300 bg-background px-4 text-base md:text-[15px]";

const SEATING_TYPE_LABEL: Record<SeatingType, string> = { general_admission: "Entrada general (de pie)", numbered: "Numerada" };

/** `"none"` stands for `kind: ""` (no shape, or keep the stored one): the select needs a real value. */
const NO_SHAPE = "none";
type ShapeChoice = typeof NO_SHAPE | "rectangle" | "ellipse";

/** A visible starting point when a shape kind is picked, inside the map. */
const DEFAULT_SHAPE_NUMBERS = { x: "100", y: "120", width: "200", height: "120" };

/** Focus order = visual order. */
const FIELD_ORDER = [
  "name",
  "seatingType",
  "capacity",
  "color",
  "shape.x",
  "shape.y",
  "shape.width",
  "shape.height",
  "sortOrder",
] as const;
type FieldName = (typeof FIELD_ORDER)[number];

const fieldId = (field: string) => `zone-${field.replace(".", "-")}`;
const number = new Intl.NumberFormat("es-PE");

/** What the stored shape of the zone means for the "no new shape" option. */
function noShapeLabel(zone?: ZoneForEdit): string {
  if (!zone?.shape) return "Sin forma (no se dibuja en el mapa)";
  return zone.shape.kind ? "Mantener la forma actual" : "Forma personalizada (se conserva)";
}

/**
 * Create or edit one zone: name, type, capacity (general admission), color,
 * shape (rectangle or ellipse) and order. Validates live with the zone schema
 * plus the zone's own limits (locked type, minimum capacity).
 */
export function ZoneForm({ venueId, zone, onCancel, onDone }: ZoneFormProps) {
  const [values, setValues] = useState<ZoneFormValues>(zone ? toZoneFormValues(zone) : EMPTY_ZONE_FORM_VALUES);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [attempted, setAttempted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const shape: ZoneShapeFormValues = values.shape ?? EMPTY_ZONE_FORM_VALUES.shape!;
  const isGeneral = values.seatingType === "general_admission";
  const typeLocked = zone !== undefined && !zone.capabilities.changeType;
  const minCapacity = zone?.capabilities.minCapacity ?? 0;

  const allErrors = useMemo(() => {
    const errors = getZoneErrors(values);
    if (!zone) return errors;

    const capacity = values.seatingType === "general_admission" ? Number(values.capacity) : null;
    const changes = checkZoneChange(
      { seatingType: zone.seatingType, capacity: zone.capacity },
      { seatingType: values.seatingType, capacity },
      { isReferenced: zone.isReferenced, minCapacity: zone.capabilities.minCapacity },
    );
    if (changes.includes("type_locked")) errors.seatingType = ZONE_CHANGE_MESSAGES.type_locked;
    if (changes.includes("capacity_below_in_use") && !errors.capacity) errors.capacity = ZONE_CHANGE_MESSAGES.capacity_below_in_use;
    return errors;
  }, [values, zone]);

  const errors = Object.fromEntries(FIELD_ORDER.filter((field) => attempted || touched[field]).map((field) => [field, allErrors[field]]));

  const typeNote =
    zone && values.seatingType !== zone.seatingType
      ? isGeneral
        ? zone.seatCount > 0
          ? `Se borrarán sus ${number.format(zone.seatCount)} asientos.`
          : undefined
        : "Quedará sin asientos hasta que los generes."
      : undefined;

  const describedBy = (field: FieldName, ...extra: (string | false | undefined)[]) =>
    [errors[field] ? `${fieldId(field)}-error` : null, ...extra].filter(Boolean).join(" ") || undefined;

  function bind(field: FieldName, key: "name" | "capacity" | "color" | "sortOrder") {
    return {
      id: fieldId(field),
      name: key,
      value: values[key],
      "aria-invalid": errors[field] ? true : undefined,
      onChange: (event: ChangeEvent<HTMLInputElement>) => setValues((previous) => ({ ...previous, [key]: event.target.value })),
      onBlur: () => setTouched((previous) => ({ ...previous, [field]: true })),
    };
  }

  function bindShape(key: "x" | "y" | "width" | "height") {
    const field = `shape.${key}` as FieldName;
    return {
      id: fieldId(field),
      name: key,
      value: shape[key],
      inputMode: "decimal" as const,
      "aria-invalid": errors[field] ? true : undefined,
      "aria-describedby": describedBy(field),
      onChange: (event: ChangeEvent<HTMLInputElement>) =>
        setValues((previous) => ({ ...previous, shape: { ...shape, [key]: event.target.value } })),
      onBlur: () => setTouched((previous) => ({ ...previous, [field]: true })),
    };
  }

  function chooseShape(choice: ShapeChoice) {
    const kind = choice === NO_SHAPE ? "" : choice;
    const hasNumbers = shape.x !== "" || shape.y !== "" || shape.width !== "" || shape.height !== "";
    const next: ZoneShapeFormValues = kind !== "" && !hasNumbers ? { kind, ...DEFAULT_SHAPE_NUMBERS } : { ...shape, kind };
    setValues((previous) => ({ ...previous, shape: next }));
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
      const result = zone ? await updateZoneAction({ id: zone.id, ...values }) : await createZoneAction({ venueId, ...values });
      if (result.ok) onDone();
      else setSubmitError(result.error);
    });
  }

  const shapeChoice: ShapeChoice = shape.kind === "" ? NO_SHAPE : shape.kind;
  const shapeItems: Record<ShapeChoice, string> = { none: noShapeLabel(zone), rectangle: "Rectángulo", ellipse: "Elipse" };
  const typeNoteId = "zone-type-note";
  const typeLockedId = "zone-type-locked";
  const capacityHintId = "zone-capacity-hint";
  const shapeHintId = "zone-shape-hint";

  return (
    <form noValidate onSubmit={handleSubmit} aria-label={zone ? `Editar zona ${zone.name}` : "Nueva zona"} className="flex flex-col gap-4">
      <FormField id={fieldId("name")} label="Nombre" error={errors.name}>
        <Input
          {...bind("name", "name")}
          aria-required
          aria-describedby={describedBy("name")}
          autoComplete="off"
          placeholder="Ej. Platea"
          className={FIELD_CLASS}
        />
      </FormField>

      <FormField id={fieldId("seatingType")} label="Tipo de zona" error={errors.seatingType}>
        <Select
          name="seatingType"
          value={values.seatingType}
          items={SEATING_TYPE_LABEL}
          disabled={typeLocked}
          onValueChange={(next) => {
            if (next) setValues((previous) => ({ ...previous, seatingType: next as SeatingType }));
          }}
        >
          <SelectTrigger
            id={fieldId("seatingType")}
            aria-invalid={errors.seatingType ? true : undefined}
            aria-describedby={describedBy("seatingType", typeLocked && typeLockedId, typeNote && typeNoteId)}
            className={SELECT_CLASS}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SEATING_TYPE_LABEL).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {typeLocked && (
          <p id={typeLockedId} className="text-[13px] text-muted-foreground">
            {ZONE_CHANGE_MESSAGES.type_locked}
          </p>
        )}
        {typeNote && (
          <p id={typeNoteId} className="text-[13px] font-medium text-amber-800">
            {typeNote}
          </p>
        )}
      </FormField>

      {isGeneral ? (
        <FormField id={fieldId("capacity")} label="Capacidad" error={errors.capacity}>
          <Input
            {...bind("capacity", "capacity")}
            aria-required
            aria-describedby={describedBy("capacity", minCapacity > 0 && capacityHintId)}
            inputMode="numeric"
            autoComplete="off"
            placeholder="Ej. 500"
            className={FIELD_CLASS}
          />
          {minCapacity > 0 && (
            <p id={capacityHintId} className="text-[13px] text-muted-foreground">
              Mínimo {number.format(minCapacity)}: un evento ya usa esa capacidad.
            </p>
          )}
        </FormField>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          La capacidad de una zona numerada es su cantidad de asientos: se generan después de guardarla.
        </p>
      )}

      <FormField id={fieldId("color")} label="Color" error={errors.color}>
        <div className="flex items-center gap-3">
          <input
            type="color"
            {...bind("color", "color")}
            aria-describedby={describedBy("color", "zone-color-value")}
            className="h-11 w-16 cursor-pointer rounded-xl border border-zinc-300 bg-background p-1 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none aria-invalid:border-destructive"
          />
          <span id="zone-color-value" className="font-mono text-sm text-muted-foreground">
            {values.color.toUpperCase()}
          </span>
        </div>
      </FormField>

      <fieldset className="flex flex-col gap-4 rounded-2xl border border-border p-4">
        <legend className="px-1 text-sm font-medium">Forma en el mapa</legend>
        <FormField id="zone-shapeKind" label="Forma" required={false}>
          <Select name="shapeKind" value={shapeChoice} items={shapeItems} onValueChange={(next) => next && chooseShape(next as ShapeChoice)}>
            <SelectTrigger id="zone-shapeKind" aria-describedby={shapeHintId} className={SELECT_CLASS}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(shapeItems).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p id={shapeHintId} className="text-[13px] text-muted-foreground">
            {zone?.shape && !zone.shape.kind && shape.kind === ""
              ? "La forma actual es personalizada: elige rectángulo o elipse solo si quieres reemplazarla."
              : `Medidas en unidades del mapa (${VENUE_BOUNDS.width} × ${VENUE_BOUNDS.height}).`}
          </p>
        </FormField>

        {shape.kind !== "" && (
          <div className="grid grid-cols-2 gap-4">
            <FormField id={fieldId("shape.x")} label="X (izquierda)" error={errors["shape.x"]}>
              <Input {...bindShape("x")} aria-required autoComplete="off" className={FIELD_CLASS} />
            </FormField>
            <FormField id={fieldId("shape.y")} label="Y (arriba)" error={errors["shape.y"]}>
              <Input {...bindShape("y")} aria-required autoComplete="off" className={FIELD_CLASS} />
            </FormField>
            <FormField id={fieldId("shape.width")} label="Ancho" error={errors["shape.width"]}>
              <Input {...bindShape("width")} aria-required autoComplete="off" className={FIELD_CLASS} />
            </FormField>
            <FormField id={fieldId("shape.height")} label="Alto" error={errors["shape.height"]}>
              <Input {...bindShape("height")} aria-required autoComplete="off" className={FIELD_CLASS} />
            </FormField>
          </div>
        )}
      </fieldset>

      <FormField id={fieldId("sortOrder")} label="Orden" error={errors.sortOrder}>
        <Input
          {...bind("sortOrder", "sortOrder")}
          aria-required
          aria-describedby={describedBy("sortOrder")}
          inputMode="numeric"
          autoComplete="off"
          className={FIELD_CLASS}
        />
      </FormField>

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
          {isPending ? "Guardando…" : zone ? "Guardar zona" : "Crear zona"}
        </Button>
      </div>
    </form>
  );
}
