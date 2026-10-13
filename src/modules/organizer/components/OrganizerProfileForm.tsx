"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { updateOrganizerProfileAction } from "@/modules/organizer/actions";
import { organizerProfileSchema } from "@/modules/organizer/organizer.schema";

interface OrganizerProfileFormProps {
  defaultBusinessName: string;
  /** Saved RUC; empty when the organizer hasn't entered it yet. */
  defaultTaxId: string;
}

type FieldErrors = Partial<Record<"businessName" | "taxId", string>>;

const FIELD_CLASS = "h-[52px] rounded-[14px] border-zinc-300 bg-background px-4 text-base md:text-[15px]";
const GENERIC_ERROR = "No pudimos guardar tu perfil. Intenta de nuevo.";

/** Business name and RUC of the organizer. Validated with the same schema the server action re-checks. */
export function OrganizerProfileForm({ defaultBusinessName, defaultTaxId }: OrganizerProfileFormProps) {
  const [businessName, setBusinessName] = useState(defaultBusinessName);
  const [taxId, setTaxId] = useState(defaultTaxId);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);

    // The schema trims the name but not the RUC: trim it here so pasted spaces don't fail.
    const parsed = organizerProfileSchema.safeParse({ businessName, taxId: taxId.trim() });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field === "businessName" || field === "taxId") && !next[field]) next[field] = issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});

    setSaving(true);
    try {
      const response = await updateOrganizerProfileAction(parsed.data);
      setResult({ ok: response.ok, message: response.ok ? (response.message ?? "Perfil actualizado.") : response.error });
    } catch {
      setResult({ ok: false, message: GENERIC_ERROR });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <FormField id="businessName" label="Nombre del negocio" error={errors.businessName}>
        <Input
          id="businessName"
          name="businessName"
          autoComplete="organization"
          value={businessName}
          onChange={(event) => setBusinessName(event.target.value)}
          aria-invalid={Boolean(errors.businessName)}
          aria-describedby={errors.businessName ? "businessName-error" : undefined}
          className={FIELD_CLASS}
        />
      </FormField>

      <FormField id="taxId" label="RUC" error={errors.taxId}>
        <Input
          id="taxId"
          name="taxId"
          inputMode="numeric"
          autoComplete="off"
          placeholder="20123456789"
          value={taxId}
          onChange={(event) => setTaxId(event.target.value)}
          aria-invalid={Boolean(errors.taxId)}
          aria-describedby={errors.taxId ? "taxId-error" : undefined}
          className={FIELD_CLASS}
        />
      </FormField>

      {result && (
        <p
          role={result.ok ? "status" : "alert"}
          className={result.ok ? "text-sm font-medium text-green-800" : "text-sm font-medium text-destructive"}
        >
          {result.message}
        </p>
      )}

      <Button type="submit" disabled={saving} className="h-11 self-start rounded-xl px-5 text-sm font-semibold">
        {saving ? "Guardando…" : "Guardar perfil"}
      </Button>
    </form>
  );
}
