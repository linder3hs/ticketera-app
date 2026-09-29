import { z } from "zod";

export const DOCUMENT_TYPES = ["DNI", "CE", "Pasaporte"] as const;

const digits = (value: string) => value.replace(/[\s-]/g, "");

/** True when "MM/AA" is a real month that hasn't ended yet. */
function isValidExpiry(value: string, now = new Date()): boolean {
  const match = /^(\d{2})\/(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return false;
  // The card works until the last day of its month.
  return new Date(year, month, 1) > now;
}

function isDocument(value: unknown): value is { documentType: string; documentNumber: string } {
  const candidate = value as { documentType?: unknown; documentNumber?: unknown } | null;
  return (
    typeof candidate?.documentNumber === "string" &&
    DOCUMENT_TYPES.includes(candidate.documentType as (typeof DOCUMENT_TYPES)[number])
  );
}

const buyerSchema = z
  .object({
    fullName: z.string().trim().min(3, "Ingresa tu nombre completo."),
    email: z.email("Ingresa un correo válido."),
    documentType: z.enum(DOCUMENT_TYPES),
    documentNumber: z.string().trim(),
    phone: z
      .string()
      .transform(digits)
      .pipe(z.string().regex(/^\+?\d{9,15}$/, "Ingresa un celular válido (9 a 15 dígitos).")),
    acceptTerms: z.literal(true, "Debes aceptar los términos para continuar."),
  })
  .superRefine(
    (buyer, ctx) => {
      const isValid =
        buyer.documentType === "DNI"
          ? /^\d{8}$/.test(buyer.documentNumber)
          : /^[A-Za-z0-9]{6,12}$/.test(buyer.documentNumber);
      if (!isValid) {
        ctx.addIssue({
          code: "custom",
          path: ["documentNumber"],
          message: buyer.documentType === "DNI" ? "El DNI tiene 8 dígitos." : "Ingresa un documento válido (6 a 12 caracteres).",
        });
      }
    },
    // Also run when other fields are invalid, so every error shows at once.
    { when: ({ value }) => isDocument(value) },
  );

const cardSchema = z.object({
  method: z.literal("card"),
  cardNumber: z
    .string()
    .transform(digits)
    .pipe(z.string().regex(/^\d{13,19}$/, "Ingresa un número de tarjeta válido.")),
  cardExpiry: z.string().refine((value) => isValidExpiry(value), "Usa el formato MM/AA y una fecha no vencida."),
  cardCvv: z.string().trim().regex(/^\d{3,4}$/, "El CVV tiene 3 o 4 dígitos."),
  cardName: z.string().trim().min(3, "Ingresa el nombre que figura en la tarjeta."),
});

const paymentSchema = z.discriminatedUnion("method", [
  cardSchema,
  z.object({ method: z.literal("yape") }),
  z.object({ method: z.literal("cash") }),
]);

/** Checkout form: buyer data plus the payment method (card data only for cards). */
export const checkoutSchema = z.intersection(buyerSchema, paymentSchema);

export type CheckoutInput = z.input<typeof checkoutSchema>;

/** Every field the form may render, for its state and error map. */
export type CheckoutField =
  | "fullName"
  | "email"
  | "documentType"
  | "documentNumber"
  | "phone"
  | "acceptTerms"
  | "method"
  | "cardNumber"
  | "cardExpiry"
  | "cardCvv"
  | "cardName";

/** First error message of each invalid field, or `{}` when the form is valid. */
export function getCheckoutErrors(values: unknown): Partial<Record<CheckoutField, string>> {
  const result = checkoutSchema.safeParse(values);
  if (result.success) return {};

  const errors: Partial<Record<CheckoutField, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as CheckoutField | undefined;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}
