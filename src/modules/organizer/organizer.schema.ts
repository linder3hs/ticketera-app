import { z } from "zod";

const RUC_LENGTH = 11;
const RUC_PREFIXES = ["10", "15", "17", "20"];
const RUC_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Peruvian RUC: 11 digits, known prefix and a modulo-11 check digit. Offline, no SUNAT lookup. */
export function isValidRuc(value: string): boolean {
  if (!/^\d{11}$/.test(value)) return false;
  if (!RUC_PREFIXES.includes(value.slice(0, 2))) return false;

  const sum = RUC_WEIGHTS.reduce((total, weight, index) => total + weight * Number(value[index]), 0);
  const checkDigit = (11 - (sum % 11)) % 10;
  return checkDigit === Number(value[RUC_LENGTH - 1]);
}

export const organizerProfileSchema = z.object({
  businessName: z
    .string("Ingresa el nombre del negocio.")
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres.")
    .max(120, "El nombre no puede superar los 120 caracteres."),
  taxId: z
    .string("Ingresa tu RUC.")
    .regex(/^\d*$/, "El RUC solo debe contener números.")
    .length(RUC_LENGTH, "El RUC debe tener 11 dígitos.")
    .refine(isValidRuc, "El RUC no es válido."),
});

export type OrganizerProfileInput = z.infer<typeof organizerProfileSchema>;
