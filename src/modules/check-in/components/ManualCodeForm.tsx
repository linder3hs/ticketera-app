"use client";

import { useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { checkInInputSchema } from "@/modules/check-in/check-in.schema";

interface ManualCodeFormProps {
  /** Receives the normalized code (the same one the server validates). */
  onSubmit: (code: string) => void;
  /** A request is in flight: the form is disabled. */
  pending: boolean;
}

const codeSchema = checkInInputSchema.shape.code;

/** Typed fallback for when the camera is unavailable or the QR does not read. */
export function ManualCodeForm({ onSubmit, pending }: ManualCodeFormProps) {
  const id = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string>();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = codeSchema.safeParse(value);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    setValue("");
    onSubmit(parsed.data);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
      <FormField id={id} label="Código de la entrada" error={error} required={false}>
        <Input
          id={id}
          name="code"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={pending}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-[52px] rounded-[14px] border-zinc-300 bg-background px-4 font-mono text-base md:text-[15px]"
        />
      </FormField>
      <Button type="submit" disabled={pending} className="h-[52px] cursor-pointer rounded-[14px] text-[15px] font-semibold">
        {pending ? "Validando…" : "Validar código"}
      </Button>
    </form>
  );
}
