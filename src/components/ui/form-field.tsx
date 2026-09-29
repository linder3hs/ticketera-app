import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface FormFieldProps {
  /** Id of the control inside; the error gets `${id}-error`. */
  id: string;
  label: ReactNode;
  error?: string;
  /** Shows the red asterisk. */
  required?: boolean;
  /** Extra content on the label row, right-aligned (e.g. a link). */
  labelAside?: ReactNode;
  className?: string;
  children: ReactNode;
}

/**
 * Label, control and error message. Pair the control with
 * `aria-describedby={`${id}-error`}` and `aria-invalid` when `error` is set.
 */
export function FormField({ id, label, error, required = true, labelAside, className, children }: FormFieldProps) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium">
          {label}
          {required && (
            <span aria-hidden="true" className="ml-0.5 text-destructive">
              *
            </span>
          )}
        </label>
        {labelAside}
      </div>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-[13px] font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
