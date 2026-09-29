"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Lock, Smartphone, Store, TicketX } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatEventPrice } from "@/modules/event/event.utils";
import { getOrderLines, getOrderTotals, useBookingStore } from "@/modules/booking/booking.store";
import type { PaymentMethod, Zone } from "@/modules/booking/booking.types";
import { DOCUMENT_TYPES, getCheckoutErrors, type CheckoutField } from "@/modules/booking/checkout.schema";
import { CheckoutEventHeader, CheckoutSummary, type CheckoutEvent } from "@/modules/booking/components/CheckoutSummary";
import { PaymentMethodPicker } from "@/modules/booking/components/PaymentMethodPicker";
import { ReservationTimer } from "@/modules/booking/components/ReservationTimer";

interface CheckoutFormProps {
  event: CheckoutEvent;
  zones: Zone[];
}

type Values = {
  fullName: string;
  email: string;
  documentType: (typeof DOCUMENT_TYPES)[number];
  documentNumber: string;
  phone: string;
  method: PaymentMethod;
  cardNumber: string;
  cardExpiry: string;
  cardCvv: string;
  cardName: string;
  acceptTerms: boolean;
};

const INITIAL_VALUES: Values = {
  fullName: "",
  email: "",
  documentType: "DNI",
  documentNumber: "",
  phone: "",
  method: "card",
  cardNumber: "",
  cardExpiry: "",
  cardCvv: "",
  cardName: "",
  acceptTerms: false,
};

/** Focus order for the first invalid field. */
const FIELD_ORDER: CheckoutField[] = [
  "fullName",
  "email",
  "documentNumber",
  "phone",
  "cardNumber",
  "cardExpiry",
  "cardCvv",
  "cardName",
  "acceptTerms",
];

const FIELD_CLASS = "h-[52px] rounded-[14px] border-zinc-300 bg-background px-4 text-base md:text-[15px]";
const CARD_CLASS = "flex flex-col gap-4 rounded-[20px] border border-border bg-card px-4 py-5 lg:gap-5 lg:rounded-3xl lg:p-7";

function Field({
  id,
  label,
  error,
  className,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        <span aria-hidden="true" className="ml-0.5 text-destructive">
          *
        </span>
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-[13px] font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function PayButton({ label, disabled, className }: { label: string; disabled: boolean; className: string }) {
  return (
    <Button
      type="submit"
      variant="cta"
      disabled={disabled}
      className={cn(
        "cursor-pointer gap-2 font-semibold disabled:bg-zinc-200 disabled:text-muted-foreground disabled:opacity-100",
        className,
      )}
    >
      <Lock className="size-[18px]" aria-hidden="true" />
      {label}
    </Button>
  );
}

function EmptyState({ eventId, title, description }: { eventId: string; title: string; description: string }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 px-4 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-[18px] bg-indigo-50 text-primary">
        <TicketX className="size-6" aria-hidden="true" />
      </span>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-[15px] text-muted-foreground">{description}</p>
      <Link
        href={`/events/${eventId}/tickets`}
        className="mt-2 flex h-12 items-center rounded-[14px] bg-foreground px-5 text-[15px] font-semibold text-background focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Elegir entradas
      </Link>
    </div>
  );
}

/**
 * Step 2 of the purchase: buyer data, payment method and terms, with the
 * reservation countdown and the order summary. A valid submit simulates the
 * payment and opens the confirmation.
 */
export function CheckoutForm({ event, zones }: CheckoutFormProps) {
  const router = useRouter();
  const store = useBookingStore();
  const [values, setValues] = useState<Values>(INITIAL_VALUES);
  const [errors, setErrors] = useState<Partial<Record<CheckoutField, string>>>({});
  const [wasSubmitted, setWasSubmitted] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);

  const isCurrent = store.eventId === event.id;
  const lines = isCurrent ? getOrderLines(zones, store) : [];
  const { count, total } = getOrderTotals(lines);
  const { startReservation, reset } = store;
  const hasTickets = count > 0;

  useEffect(() => {
    if (hasTickets) startReservation();
  }, [hasTickets, startReservation]);

  const handleExpire = useCallback(() => {
    setIsExpired(true);
    reset();
  }, [reset]);

  if (isPaid) return <p className="px-4 py-16 text-center text-muted-foreground">Procesando tu pago…</p>;
  if (isExpired) {
    return (
      <EmptyState
        eventId={event.id}
        title="Tu reserva expiró"
        description="Liberamos tus entradas porque pasaron 10 minutos. Vuelve a elegirlas para continuar."
      />
    );
  }
  if (!hasTickets) {
    return (
      <EmptyState
        eventId={event.id}
        title="Todavía no elegiste entradas"
        description="Elige tus entradas para continuar con el pago."
      />
    );
  }

  const totalLabel = formatEventPrice(total, event.currency);
  const payLabel = `Pagar ${totalLabel}`;

  function update<K extends keyof Values>(key: K, value: Values[K]) {
    const next = { ...values, [key]: value };
    setValues(next);
    // After the first submit, errors follow the user's edits.
    if (wasSubmitted) setErrors(getCheckoutErrors(next));
  }

  function inputProps(field: CheckoutField) {
    return {
      id: field,
      name: field,
      "aria-required": true,
      "aria-invalid": errors[field] ? true : undefined,
      "aria-describedby": errors[field] ? `${field}-error` : undefined,
    };
  }

  function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setWasSubmitted(true);
    const nextErrors = getCheckoutErrors(values);
    setErrors(nextErrors);

    const firstInvalid = FIELD_ORDER.find((field) => nextErrors[field]);
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus();
      return;
    }

    store.confirmOrder({
      zones,
      currency: event.currency,
      method: values.method,
      buyerName: values.fullName.trim(),
      email: values.email.trim(),
    });
    setIsPaid(true);
    router.push(`/events/${event.id}/confirmation`);
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="mx-auto flex max-w-7xl flex-col gap-4 p-4 md:px-6 lg:gap-6 lg:pt-6 lg:pb-20"
    >
      {store.reservationExpiresAt && (
        <ReservationTimer expiresAt={store.reservationExpiresAt} onExpire={handleExpire} />
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start lg:gap-8">
        <div className="flex flex-col gap-4 lg:gap-6">
          <section className="overflow-hidden rounded-[20px] border border-border bg-card lg:hidden">
            <button
              type="button"
              aria-expanded={isSummaryOpen}
              aria-controls="checkout-summary"
              onClick={() => setIsSummaryOpen((open) => !open)}
              className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
            >
              <span className="min-w-0 flex-1">
                <CheckoutEventHeader event={event} size="sm" />
              </span>
              <span className="shrink-0 text-right text-[13px] text-muted-foreground">
                {count === 1 ? "1 entrada" : `${count} entradas`}
                <span className="block text-[15px] font-semibold text-foreground">{totalLabel}</span>
              </span>
              <ChevronDown
                className={cn("size-[18px] shrink-0 transition-transform", isSummaryOpen && "rotate-180")}
                aria-hidden="true"
              />
            </button>
            {isSummaryOpen && (
              <div id="checkout-summary" className="border-t border-zinc-100 px-4 pt-3 pb-4">
                <CheckoutSummary event={event} lines={lines} />
              </div>
            )}
          </section>

          <section className={CARD_CLASS}>
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold lg:text-xl">Datos del comprador</h2>
              <p className="text-[13px] text-muted-foreground lg:text-sm">
                Enviaremos tus entradas al correo que indiques. Los campos con{" "}
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
                <span className="sr-only">asterisco</span> son obligatorios.
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2 lg:gap-x-5 lg:gap-y-[18px]">
              <Field id="fullName" label="Nombre completo" error={errors.fullName}>
                <Input
                  {...inputProps("fullName")}
                  autoComplete="name"
                  placeholder="Como figura en tu documento"
                  value={values.fullName}
                  onChange={(e) => update("fullName", e.target.value)}
                  className={FIELD_CLASS}
                />
              </Field>
              <Field id="email" label="Correo electrónico" error={errors.email}>
                <Input
                  {...inputProps("email")}
                  type="email"
                  autoComplete="email"
                  placeholder="tu@email.com"
                  value={values.email}
                  onChange={(e) => update("email", e.target.value)}
                  className={FIELD_CLASS}
                />
              </Field>
              <Field id="documentNumber" label="Documento de identidad" error={errors.documentNumber}>
                <div className="flex gap-2">
                  <select
                    aria-label="Tipo de documento"
                    value={values.documentType}
                    onChange={(e) => update("documentType", e.target.value as Values["documentType"])}
                    className={cn(
                      FIELD_CLASS,
                      "w-[104px] shrink-0 cursor-pointer border px-2.5 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 lg:w-[110px]",
                    )}
                  >
                    {DOCUMENT_TYPES.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                  <Input
                    {...inputProps("documentNumber")}
                    inputMode={values.documentType === "DNI" ? "numeric" : "text"}
                    placeholder="Número"
                    value={values.documentNumber}
                    onChange={(e) => update("documentNumber", e.target.value)}
                    className={FIELD_CLASS}
                  />
                </div>
              </Field>
              <Field id="phone" label="Celular" error={errors.phone}>
                <Input
                  {...inputProps("phone")}
                  type="tel"
                  autoComplete="tel"
                  placeholder="Número de celular"
                  value={values.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  className={FIELD_CLASS}
                />
              </Field>
            </div>
          </section>

          <section className={CARD_CLASS}>
            <h2 className="text-lg font-semibold lg:text-xl">Método de pago</h2>
            <PaymentMethodPicker value={values.method} onChange={(method) => update("method", method)} />

            {values.method === "card" && (
              <div className="grid grid-cols-2 gap-3 gap-y-4 lg:grid-cols-4 lg:gap-x-5 lg:gap-y-[18px]">
                <Field id="cardNumber" label="Número de tarjeta" error={errors.cardNumber} className="col-span-2">
                  <Input
                    {...inputProps("cardNumber")}
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="0000 0000 0000 0000"
                    value={values.cardNumber}
                    onChange={(e) => update("cardNumber", e.target.value)}
                    className={FIELD_CLASS}
                  />
                </Field>
                <Field id="cardExpiry" label="Vencimiento" error={errors.cardExpiry}>
                  <Input
                    {...inputProps("cardExpiry")}
                    autoComplete="cc-exp"
                    placeholder="MM/AA"
                    value={values.cardExpiry}
                    onChange={(e) => update("cardExpiry", e.target.value)}
                    className={FIELD_CLASS}
                  />
                </Field>
                <Field id="cardCvv" label="CVV" error={errors.cardCvv}>
                  <Input
                    {...inputProps("cardCvv")}
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    placeholder="3 o 4 dígitos"
                    value={values.cardCvv}
                    onChange={(e) => update("cardCvv", e.target.value)}
                    className={FIELD_CLASS}
                  />
                </Field>
                <Field id="cardName" label="Nombre en la tarjeta" error={errors.cardName} className="col-span-2 lg:col-span-4">
                  <Input
                    {...inputProps("cardName")}
                    autoComplete="cc-name"
                    placeholder="Como aparece en la tarjeta"
                    value={values.cardName}
                    onChange={(e) => update("cardName", e.target.value)}
                    className={FIELD_CLASS}
                  />
                </Field>
              </div>
            )}
            {values.method !== "card" && (
              <p className="flex items-start gap-3 rounded-[14px] bg-indigo-50 p-4 text-sm leading-normal text-indigo-800 lg:items-center lg:gap-3.5 lg:rounded-2xl lg:px-5 lg:py-[18px] lg:text-[15px]">
                {values.method === "yape" ? (
                  <Smartphone className="size-5 shrink-0" aria-hidden="true" />
                ) : (
                  <Store className="size-5 shrink-0" aria-hidden="true" />
                )}
                {values.method === "yape"
                  ? "Al continuar te mostraremos un código QR para pagar desde tu app de Yape."
                  : "Generaremos un código de pago para que pagues en agentes, bodegas o tu banca móvil."}
              </p>
            )}
          </section>

          <div className="flex flex-col gap-1.5 px-1">
            <label className="flex cursor-pointer items-start gap-3 text-sm leading-normal text-zinc-700 lg:items-center">
              <input
                {...inputProps("acceptTerms")}
                type="checkbox"
                checked={values.acceptTerms}
                onChange={(e) => update("acceptTerms", e.target.checked)}
                className="size-[22px] shrink-0 cursor-pointer accent-primary lg:size-5"
              />
              <span>
                Acepto los{" "}
                <a href="#" className="font-medium text-primary hover:underline">
                  Términos y condiciones
                </a>{" "}
                y la{" "}
                <a href="#" className="font-medium text-primary hover:underline">
                  Política de privacidad
                </a>
                .
              </span>
            </label>
            {errors.acceptTerms && (
              <p id="acceptTerms-error" className="text-[13px] font-medium text-destructive">
                {errors.acceptTerms}
              </p>
            )}
          </div>
        </div>

        <aside
          aria-label="Resumen de la compra"
          className="sticky top-6 hidden flex-col gap-5 rounded-3xl border border-border bg-card p-7 shadow-[0_20px_40px_-28px_rgba(24,24,27,0.35)] lg:flex"
        >
          <CheckoutEventHeader event={event} size="lg" />
          <div className="border-t border-zinc-100 pt-[18px]">
            <CheckoutSummary event={event} lines={lines} />
          </div>
          <div className="flex items-baseline justify-between border-t-[1.5px] border-dashed border-zinc-300 pt-[18px]">
            <span className="text-[15px] font-medium">Total</span>
            <span className="text-[28px] font-bold tracking-tight tabular-nums">{totalLabel}</span>
          </div>
          <PayButton label={payLabel} disabled={!values.acceptTerms} className="h-14 rounded-2xl text-base" />
          {!values.acceptTerms && (
            <p className="-mt-2 text-center text-[13px] text-muted-foreground">Acepta los términos para continuar.</p>
          )}
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-border bg-background px-4 pt-3 pb-5 shadow-[0_-12px_24px_-18px_rgba(24,24,27,0.35)] lg:hidden">
        <PayButton label={payLabel} disabled={!values.acceptTerms} className="h-[54px] rounded-2xl text-base" />
        {!values.acceptTerms && (
          <p className="text-center text-xs text-muted-foreground">Acepta los términos para continuar.</p>
        )}
      </div>
    </form>
  );
}
