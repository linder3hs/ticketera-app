"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { platformFeePercentSchema } from "@/modules/payment/payment.schema";
import { updatePlatformFeeAction } from "@/modules/payment/actions";

const FIELD_CLASS = "h-[52px] rounded-[14px] border-zinc-300 bg-background px-4 text-base md:text-[15px]";
const INVALID_MESSAGE = "Ingresa un porcentaje entre 0 y 100.";
const GENERIC_ERROR = "No pudimos guardar la comisión. Intenta de nuevo.";

/** Edits the platform fee percentage. Validated with the same schema the server action re-checks. */
export function PlatformFeeForm({ defaultPercent }: { defaultPercent: number }) {
  const [value, setValue] = useState(String(defaultPercent));
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);

    // `Number("")` is 0: an empty field must not silently set a 0 % fee.
    const parsed = platformFeePercentSchema.safeParse(value.trim() === "" ? NaN : Number(value));
    if (!parsed.success) {
      setError(INVALID_MESSAGE);
      return;
    }
    setError(undefined);

    setSaving(true);
    try {
      const response = await updatePlatformFeeAction(parsed.data);
      setResult({ ok: response.ok, message: response.ok ? (response.message ?? "Comisión actualizada.") : response.error });
    } catch {
      setResult({ ok: false, message: GENERIC_ERROR });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <FormField id="platformFeePercent" label="Comisión de la plataforma (%)" error={error}>
        <Input
          id="platformFeePercent"
          name="platformFeePercent"
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step="any"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "platformFeePercent-error" : undefined}
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
        {saving ? "Guardando…" : "Guardar comisión"}
      </Button>
    </form>
  );
}
