import { CircleAlert, CircleCheck, CircleX, LoaderCircle, TriangleAlert, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CheckInOutcome, CheckInResult } from "@/modules/check-in/check-in.types";
import { CHECK_IN_MESSAGES } from "@/modules/check-in/check-in.utils";
import { toLimaTime } from "@/modules/event/event-list.utils";

interface CheckInResultCardProps {
  /** The answer to the last scan; `undefined` before the first one. */
  outcome?: CheckInOutcome;
  /** Network or validation failure of the last request (a business result is not an error). */
  error?: string | null;
  /** A request is in flight. */
  pending?: boolean;
}

// Icon + text + color: the result is never conveyed by color alone.
const RESULT_STYLES: Record<CheckInResult, { icon: LucideIcon; className: string }> = {
  ok: { icon: CircleCheck, className: "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100" },
  already_used: { icon: TriangleAlert, className: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100" },
  wrong_event: { icon: CircleAlert, className: "border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-100" },
  invalid: { icon: CircleX, className: "border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-100" },
};

const PANEL_CLASS = "flex items-start gap-3 rounded-[20px] border p-4 lg:p-5";

/** Only `ok` and `already_used` carry ticket data; the other results show the message alone. */
function resultDetail({ result, holderName, checkedInAt }: CheckInOutcome): string | null {
  if (result === "ok") return holderName;
  if (result === "already_used" && checkedInAt) return `Ingresó a las ${toLimaTime(checkedInAt)}`;
  return null;
}

/** Last scan result, announced politely to screen readers. */
export function CheckInResultCard({ outcome, error, pending = false }: CheckInResultCardProps) {
  const style = outcome ? RESULT_STYLES[outcome.result] : undefined;
  const detail = outcome ? resultDetail(outcome) : null;

  return (
    <div className="flex flex-col gap-3">
      {/* The live region stays mounted so each change of content is announced. */}
      <div role="status" aria-live="polite">
        {pending && (
          <div className={cn(PANEL_CLASS, "items-center border-border bg-card text-muted-foreground")}>
            <LoaderCircle className="size-6 shrink-0 animate-spin" aria-hidden="true" />
            <p className="text-base font-medium">Validando entrada…</p>
          </div>
        )}
        {!pending && outcome && style && (
          <div className={cn(PANEL_CLASS, style.className)}>
            <style.icon className="size-8 shrink-0" aria-hidden="true" />
            <div className="flex flex-col gap-0.5">
              <p className="text-xl font-bold">{CHECK_IN_MESSAGES[outcome.result]}</p>
              {detail && <p className="text-base">{detail}</p>}
            </div>
          </div>
        )}
      </div>
      {!pending && error && (
        <p role="alert" className={cn(PANEL_CLASS, "items-center border-destructive/30 bg-destructive/10 text-base font-medium text-destructive")}>
          <CircleX className="size-6 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      {!pending && !outcome && !error && (
        <p className="text-sm text-muted-foreground">El resultado de cada entrada aparecerá aquí.</p>
      )}
    </div>
  );
}
