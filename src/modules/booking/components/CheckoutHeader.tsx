import Link from "next/link";
import { ArrowLeft, Check, Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import { Logo } from "@/components/Logo";

const STEPS = ["Entradas", "Datos y pago", "Confirmación"];

/** Mobile title of each step, in the same order as `STEPS`. */
const MOBILE_TITLES = ["Elige tus entradas", "Datos y pago", "Confirmación"];

interface CheckoutHeaderProps {
  /** 1-based index into the purchase steps. */
  currentStep: number;
  backHref: string;
  backLabel: string;
}

/**
 * Purchase flow header: logo, step indicator and "secure purchase" from `md`;
 * back button, step title and a progress bar on phones.
 */
export function CheckoutHeader({ currentStep, backHref, backLabel }: CheckoutHeaderProps) {
  return (
    <header className="border-b border-zinc-100 bg-background">
      <div className="mx-auto hidden h-[76px] max-w-7xl items-center justify-between px-6 md:flex">
        <div className="w-60">
          <Logo />
        </div>
        <ol aria-label="Pasos de la compra" className="flex items-center gap-3 text-sm">
          {STEPS.map((label, index) => {
            const step = index + 1;
            const isCurrent = step === currentStep;
            return (
              <li key={label} className="flex items-center gap-3">
                {index > 0 && (
                  <span
                    aria-hidden="true"
                    className={cn("h-[1.5px] w-10", step <= currentStep ? "bg-primary" : "bg-zinc-300")}
                  />
                )}
                <span
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn("flex items-center gap-2.5", isCurrent && "font-semibold", step > currentStep && "text-muted-foreground")}
                >
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full text-[13px]",
                      step < currentStep && "bg-primary text-primary-foreground",
                      step === currentStep && "bg-foreground text-background",
                      step > currentStep && "border-[1.5px] border-zinc-300",
                    )}
                  >
                    {step < currentStep ? <Check className="size-[15px] stroke-3" aria-label="Completado" /> : step}
                  </span>
                  {label}
                </span>
              </li>
            );
          })}
        </ol>
        <span className="flex w-60 items-center justify-end gap-2 text-sm text-muted-foreground">
          <Lock className="size-4" aria-hidden="true" />
          Compra segura
        </span>
      </div>

      <div className="md:hidden">
        <div className="flex h-[60px] items-center gap-1 pr-3 pl-1.5">
          <Link
            href={backHref}
            aria-label={backLabel}
            className="flex size-11 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ArrowLeft className="size-[22px]" aria-hidden="true" />
          </Link>
          <div className="flex flex-col">
            <span className="text-xs text-muted-foreground">
              Paso {currentStep} de {STEPS.length}
            </span>
            <span className="text-base font-semibold">{MOBILE_TITLES[currentStep - 1]}</span>
          </div>
        </div>
        <div aria-hidden="true" className="h-[3px] bg-zinc-100">
          <div className="h-full bg-primary" style={{ width: `${(currentStep / STEPS.length) * 100}%` }} />
        </div>
      </div>
    </header>
  );
}
