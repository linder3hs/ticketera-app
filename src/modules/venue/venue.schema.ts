import { z } from "zod";

import type {
  SeatGeneratorFormValues,
  SeatGeneratorInput,
  VenueFormValues,
  VenueInput,
  ZoneFormValues,
  ZoneInput,
  ZoneShapeParams,
} from "@/modules/venue/venue.types";
import {
  MAX_SEATS_PER_GENERATION,
  MIN_SHAPE_SIZE,
  VENUE_BOUNDS,
  rowLabelAt,
} from "@/modules/venue/venue.utils";

const MAX_ZONE_CAPACITY = 100_000;
const MAX_START_NUMBER = 100_000;
/** Largest value of a Postgres `integer` column (`sort_order`). */
const MAX_INT = 2_147_483_647;
const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;
const UNSIGNED_DECIMAL_PATTERN = /^\d+(\.\d+)?$/;
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const ROW_LABEL_PATTERN = /^[A-Z]{1,2}$/;

/** An integer written with digits only (no sign, no decimals, no exponent) inside `[min, max]`. */
function isIntegerBetween(value: string, min: number, max: number): boolean {
  return /^\d+$/.test(value) && Number(value) >= min && Number(value) <= max;
}

/* ---- Venue ---- */

/** `lat` and `lng` as typed: empty or a decimal inside `[-limit, limit]`; `null` when empty. */
function parseCoordinate(value: string, limit: number): number | null | "invalid" {
  if (value === "") return null;
  if (!DECIMAL_PATTERN.test(value)) return "invalid";
  const number = Number(value);
  return Math.abs(number) <= limit ? number : "invalid";
}

/**
 * Basic data of a venue. Input = form strings; output = `VenueInput`.
 * `lat`/`lng` are optional but come together: both or none.
 */
export const venueSchema = z
  .object({
    name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres.").max(120, "El nombre admite hasta 120 caracteres."),
    address: z
      .string()
      .trim()
      .min(2, "La dirección debe tener al menos 2 caracteres.")
      .max(200, "La dirección admite hasta 200 caracteres."),
    city: z.string().trim().min(2, "La ciudad debe tener al menos 2 caracteres.").max(80, "La ciudad admite hasta 80 caracteres."),
    lat: z.string().trim(),
    lng: z.string().trim(),
  })
  .superRefine((values, ctx) => {
    const lat = parseCoordinate(values.lat, 90);
    const lng = parseCoordinate(values.lng, 180);

    if (lat === "invalid") {
      ctx.addIssue({ code: "custom", path: ["lat"], message: "Latitud inválida: un número entre -90 y 90." });
    }
    if (lng === "invalid") {
      ctx.addIssue({ code: "custom", path: ["lng"], message: "Longitud inválida: un número entre -180 y 180." });
    }
    if (lat === null && lng !== null && lng !== "invalid") {
      ctx.addIssue({ code: "custom", path: ["lat"], message: "Escribe también la latitud." });
    }
    if (lng === null && lat !== null && lat !== "invalid") {
      ctx.addIssue({ code: "custom", path: ["lng"], message: "Escribe también la longitud." });
    }
  })
  .transform(
    (values): VenueInput => ({
      name: values.name,
      address: values.address,
      city: values.city,
      lat: values.lat === "" ? null : Number(values.lat),
      lng: values.lng === "" ? null : Number(values.lng),
    }),
  );

/* ---- Zone ---- */

const zoneShapeSchema = z
  .object({
    kind: z.enum(["", "rectangle", "ellipse"]),
    x: z.string().trim(),
    y: z.string().trim(),
    width: z.string().trim(),
    height: z.string().trim(),
  })
  .superRefine((shape, ctx) => {
    if (shape.kind === "") return;

    const numbers: Partial<Record<"x" | "y" | "width" | "height", number>> = {};
    for (const field of ["x", "y", "width", "height"] as const) {
      if (!UNSIGNED_DECIMAL_PATTERN.test(shape[field])) {
        ctx.addIssue({ code: "custom", path: [field], message: "Escribe un número mayor o igual a 0." });
      } else {
        numbers[field] = Number(shape[field]);
      }
    }

    const { x, y, width, height } = numbers;
    if (width !== undefined && width < MIN_SHAPE_SIZE) {
      ctx.addIssue({ code: "custom", path: ["width"], message: `El ancho mínimo es ${MIN_SHAPE_SIZE}.` });
    }
    if (height !== undefined && height < MIN_SHAPE_SIZE) {
      ctx.addIssue({ code: "custom", path: ["height"], message: `El alto mínimo es ${MIN_SHAPE_SIZE}.` });
    }
    if (x !== undefined && width !== undefined && width >= MIN_SHAPE_SIZE && x + width > VENUE_BOUNDS.width) {
      ctx.addIssue({ code: "custom", path: ["width"], message: `La forma no cabe en el mapa (ancho ${VENUE_BOUNDS.width}).` });
    }
    if (y !== undefined && height !== undefined && height >= MIN_SHAPE_SIZE && y + height > VENUE_BOUNDS.height) {
      ctx.addIssue({ code: "custom", path: ["height"], message: `La forma no cabe en el mapa (alto ${VENUE_BOUNDS.height}).` });
    }
  });

/**
 * One zone of a venue. Input = form strings; output = `ZoneInput`.
 * Capacity is required for general admission and dropped for numbered zones
 * (their capacity is the count of seats). Without a shape kind, `shape` is left out.
 */
export const zoneSchema = z
  .object({
    name: z.string().trim().min(1, "Escribe el nombre de la zona.").max(60, "El nombre admite hasta 60 caracteres."),
    seatingType: z.enum(["numbered", "general_admission"], "Elige el tipo de zona."),
    capacity: z.string().trim(),
    color: z.string().trim().regex(COLOR_PATTERN, "Color inválido: usa el formato #RRGGBB."),
    sortOrder: z.string().trim(),
    shape: zoneShapeSchema.optional(),
  })
  .superRefine((zone, ctx) => {
    if (zone.seatingType === "general_admission" && !isIntegerBetween(zone.capacity, 1, MAX_ZONE_CAPACITY)) {
      ctx.addIssue({ code: "custom", path: ["capacity"], message: "Capacidad inválida: número entero de 1 a 100 000." });
    }
    if (!isIntegerBetween(zone.sortOrder, 0, MAX_INT)) {
      ctx.addIssue({ code: "custom", path: ["sortOrder"], message: "Orden inválido: número entero, mínimo 0." });
    }
  })
  .transform((zone): ZoneInput => {
    const shape =
      zone.shape && zone.shape.kind !== ""
        ? ({
            kind: zone.shape.kind,
            x: Number(zone.shape.x),
            y: Number(zone.shape.y),
            width: Number(zone.shape.width),
            height: Number(zone.shape.height),
          } satisfies ZoneShapeParams)
        : undefined;

    return {
      name: zone.name,
      seatingType: zone.seatingType,
      capacity: zone.seatingType === "general_admission" ? Number(zone.capacity) : null,
      color: zone.color,
      sortOrder: Number(zone.sortOrder),
      ...(shape && { shape }),
    };
  });

/* ---- Seat generator ---- */

/** Empty or missing means "use the default". */
const withDefault = (value: string | undefined, fallback: string) => (value === undefined || value.trim() === "" ? fallback : value.trim());

/**
 * Parameters of a seat generation. Input = form strings; output = `SeatGeneratorInput`.
 * The grid is limited to `MAX_SEATS_PER_GENERATION` seats and row labels to two letters.
 */
export const seatGeneratorSchema = z
  .object({
    rows: z.string().trim(),
    seatsPerRow: z.string().trim(),
    firstRowLabel: z.string().optional(),
    startNumber: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    const rowsOk = isIntegerBetween(values.rows, 1, 50);
    const seatsOk = isIntegerBetween(values.seatsPerRow, 1, 100);
    const firstRowLabel = withDefault(values.firstRowLabel, "A");
    const labelOk = ROW_LABEL_PATTERN.test(firstRowLabel);

    if (!rowsOk) {
      ctx.addIssue({ code: "custom", path: ["rows"], message: "Filas inválidas: número entero de 1 a 50." });
    }
    if (!seatsOk) {
      ctx.addIssue({ code: "custom", path: ["seatsPerRow"], message: "Asientos por fila inválidos: número entero de 1 a 100." });
    }
    if (!labelOk) {
      ctx.addIssue({ code: "custom", path: ["firstRowLabel"], message: "La primera fila son 1 o 2 letras mayúsculas (A, B… AA)." });
    }
    if (!isIntegerBetween(withDefault(values.startNumber, "1"), 1, MAX_START_NUMBER)) {
      ctx.addIssue({ code: "custom", path: ["startNumber"], message: "Número inicial inválido: entero de 1 a 100 000." });
    }
    if (rowsOk && seatsOk && Number(values.rows) * Number(values.seatsPerRow) > MAX_SEATS_PER_GENERATION) {
      ctx.addIssue({
        code: "custom",
        path: ["seatsPerRow"],
        message: `Máximo ${MAX_SEATS_PER_GENERATION} asientos por generación (filas × asientos por fila).`,
      });
    }
    if (rowsOk && labelOk && rowLabelAt(firstRowLabel, Number(values.rows) - 1).length > 2) {
      ctx.addIssue({ code: "custom", path: ["firstRowLabel"], message: "Las filas no pueden pasar de ZZ." });
    }
  })
  .transform(
    (values): SeatGeneratorInput => ({
      rows: Number(values.rows),
      seatsPerRow: Number(values.seatsPerRow),
      firstRowLabel: withDefault(values.firstRowLabel, "A"),
      startNumber: Number(withDefault(values.startNumber, "1")),
    }),
  );

/* ---- First error per field, for the live form ---- */

/** First error per field, keyed by path ("name", "shape.width"…); `{}` when valid. */
function firstErrors(result: { success: boolean; error?: z.ZodError }): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of result.error?.issues ?? []) {
    const key = issue.path.join(".");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export const getVenueErrors = (values: VenueFormValues) => firstErrors(venueSchema.safeParse(values));
export const getZoneErrors = (values: ZoneFormValues) => firstErrors(zoneSchema.safeParse(values));
export const getSeatGeneratorErrors = (values: SeatGeneratorFormValues) =>
  firstErrors(seatGeneratorSchema.safeParse(values));
