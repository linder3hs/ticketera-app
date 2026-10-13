import { z } from "zod";

/** Document types as the DB stores them (`document_type` enum). */
export const DOCUMENT_TYPES = ["dni", "ce", "passport"] as const;

export type BuyerDocumentType = (typeof DOCUMENT_TYPES)[number];

/** What the UI shows for each document type. */
export const DOCUMENT_TYPE_LABELS: Record<BuyerDocumentType, string> = {
  dni: "DNI",
  ce: "CE",
  passport: "Pasaporte",
};

const digits = (value: string) => value.replace(/[\s-]/g, "");

function isDocument(value: unknown): value is { documentType: BuyerDocumentType; documentNumber: string } {
  const candidate = value as { documentType?: unknown; documentNumber?: unknown } | null;
  return (
    typeof candidate?.documentNumber === "string" &&
    DOCUMENT_TYPES.includes(candidate.documentType as BuyerDocumentType)
  );
}

const buyerFields = {
  fullName: z.string().trim().min(3, "Ingresa tu nombre completo."),
  email: z.email("Ingresa un correo válido."),
  documentType: z.enum(DOCUMENT_TYPES),
  documentNumber: z.string().trim(),
  phone: z
    .string()
    .transform(digits)
    .pipe(z.string().regex(/^\+?\d{9,15}$/, "Ingresa un celular válido (9 a 15 dígitos).")),
  acceptTerms: z.literal(true, "Debes aceptar los términos para continuar."),
};

/** The document number must match the rule of its type. */
function validateDocument(
  buyer: { documentType: BuyerDocumentType; documentNumber: string },
  ctx: z.core.$RefinementCtx,
) {
  const isValid =
    buyer.documentType === "dni"
      ? /^\d{8}$/.test(buyer.documentNumber)
      : /^[A-Za-z0-9]{6,12}$/.test(buyer.documentNumber);
  if (!isValid) {
    ctx.addIssue({
      code: "custom",
      path: ["documentNumber"],
      message: buyer.documentType === "dni" ? "El DNI tiene 8 dígitos." : "Ingresa un documento válido (6 a 12 caracteres).",
    });
  }
}

// Also run when other fields are invalid, so every error shows at once.
const documentRefinement = { when: ({ value }: { value: unknown }) => isDocument(value) };

/** Buyer data plus the acceptance of the terms. The card is validated by Stripe, not here. */
export const buyerSchema = z.object(buyerFields).superRefine(validateDocument, documentRefinement);

/** Input of the checkout Server Action: the event by slug plus the buyer. Unknown keys are dropped. */
export const startCheckoutSchema = z
  .object({ slug: z.string().trim().min(1), ...buyerFields })
  .superRefine(validateDocument, documentRefinement);

export type BuyerInput = z.input<typeof buyerSchema>;
export type StartCheckoutInput = z.input<typeof startCheckoutSchema>;

/** Every field the form may render, for its state and error map. */
export type BuyerField = "fullName" | "email" | "documentType" | "documentNumber" | "phone" | "acceptTerms";

/** First error message of each invalid field, or `{}` when the form is valid. */
export function getBuyerErrors(values: unknown): Partial<Record<BuyerField, string>> {
  const result = buyerSchema.safeParse(values);
  if (result.success) return {};

  const errors: Partial<Record<BuyerField, string>> = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as BuyerField | undefined;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}
