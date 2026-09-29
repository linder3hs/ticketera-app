import { z } from "zod";

const email = z.email("Ingresa un correo válido.");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Ingresa tu contraseña."),
});

export const registerSchema = z.object({
  fullName: z.string().trim().min(3, "Ingresa tu nombre y apellido."),
  email,
  password: z.string().min(8, "Usa al menos 8 caracteres."),
  acceptTerms: z.literal(true, "Debes aceptar los términos para continuar."),
});

export type LoginInput = z.input<typeof loginSchema>;
export type RegisterInput = z.input<typeof registerSchema>;

/** First error message of each invalid field, or `{}` when valid. */
export function getFieldErrors(schema: z.ZodType, values: unknown): Record<string, string> {
  const result = schema.safeParse(values);
  if (result.success) return {};

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? "");
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

/** The `?next=` target if it's a local path, else "Mis entradas" (no open redirects). */
export function getSafeNext(value: unknown): string {
  const next = Array.isArray(value) ? value[0] : value;
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/my-tickets";
}
