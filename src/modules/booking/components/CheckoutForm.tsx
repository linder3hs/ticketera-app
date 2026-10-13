"use client";

import { useCallback, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Lock, TicketX } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatEventPrice } from "@/modules/event/event.utils";
import { usePersistHydration } from "@/lib/use-persist-hydration";
import { startCheckoutAction } from "@/modules/booking/actions";
import { getOrderTotals, useBookingStore } from "@/modules/booking/booking.store";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, getBuyerErrors, type BuyerField } from "@/modules/booking/buyer.schema";
import type { BuyerDefaults } from "@/modules/booking/checkout.types";
import { CheckoutEventHeader, CheckoutSummary, type CheckoutEvent } from "@/modules/booking/components/CheckoutSummary";
import { ReservationTimer } from "@/modules/booking/components/ReservationTimer";
import type { ActiveReservation } from "@/modules/booking/reservation.types";
import { CardPaymentElement, CardPaymentProvider } from "@/modules/payment/components/CardPaymentProvider";
import { useCheckoutPayment } from "@/modules/payment/hooks/use-checkout-payment";
import { PAYMENT_MESSAGES, amountToCents } from "@/modules/payment/payment.utils";

interface CheckoutFormProps {
  event: CheckoutEvent;
  /** The user's live reservation for `event`: what is paid and until when. */
  reservation: ActiveReservation;
  /** What the user's profile already has, to prefill the buyer data. */
  buyerDefaults: BuyerDefaults;
}

type Values = BuyerDefaults & { acceptTerms: boolean };

/** Focus order for the first invalid field. */
const FIELD_ORDER: BuyerField[] = ["fullName", "email", "documentNumber", "phone", "acceptTerms"];

const FIELD_CLASS = "h-[52px] rounded-[14px] border-zinc-300 bg-background px-4 text-base md:text-[15px]";
const CARD_CLASS = "flex flex-col gap-4 rounded-[20px] border border-border bg-card px-4 py-5 lg:gap-5 lg:rounded-3xl lg:p-7";

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

function EmptyState({ eventSlug, title, description }: { eventSlug: string; title: string; description: string }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 px-4 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-[18px] bg-indigo-50 text-primary">
        <TicketX className="size-6" aria-hidden="true" />
      </span>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-[15px] text-muted-foreground">{description}</p>
      <Link
        href={`/events/${eventSlug}/tickets`}
        className="mt-2 flex h-12 items-center rounded-[14px] bg-foreground px-5 text-[15px] font-semibold text-background focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Elegir entradas
      </Link>
    </div>
  );
}

/**
 * Step 2 of the purchase: buyer data, card payment (Stripe Payment Element) and terms, with the
 * reservation countdown and the order summary (both from the reservation).
 */
export function CheckoutForm({ event, reservation, buyerDefaults }: CheckoutFormProps) {
  // Waits for the persisted store (`confirmOrder` writes to it); this also keeps the clock-based timer out of the server render.
  const hydrated = usePersistHydration(useBookingStore);
  const amountCents = amountToCents(getOrderTotals(reservation.lines).total);

  if (!hydrated) return <p className="px-4 py-16 text-center text-muted-foreground">Cargando tu compra…</p>;
  // Stripe doesn't charge 0, and `Elements` doesn't accept it.
  if (amountCents <= 0) {
    return (
      <EmptyState
        eventSlug={event.slug}
        title="No hay nada que pagar"
        description="Esta reserva no tiene un importe que cobrar. Elige otras entradas para continuar."
      />
    );
  }

  return (
    <CardPaymentProvider amountCents={amountCents} currency={event.currency}>
      <CheckoutFormBody event={event} reservation={reservation} buyerDefaults={buyerDefaults} />
    </CardPaymentProvider>
  );
}

/** The form itself; it lives inside the `CardPaymentProvider` because the payment hook needs it. */
function CheckoutFormBody({ event, reservation, buyerDefaults }: CheckoutFormProps) {
  const router = useRouter();
  const confirmOrder = useBookingStore((state) => state.confirmOrder);
  const { pay, isReady } = useCheckoutPayment();
  const [values, setValues] = useState<Values>(() => ({ ...buyerDefaults, acceptTerms: false }));
  const [errors, setErrors] = useState<Partial<Record<BuyerField, string>>>({});
  const [wasSubmitted, setWasSubmitted] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPaid, setIsPaid] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);

  const { lines } = reservation;
  const { count, total } = getOrderTotals(lines);

  // The selection stays in the store, ready to hold it again.
  const handleExpire = useCallback(() => setIsExpired(true), []);

  if (isPaid) return <p className="px-4 py-16 text-center text-muted-foreground">Procesando tu pago…</p>;
  // A payment in flight (e.g. a 3DS modal) is not interrupted: the expired state shows if it fails.
  if (isExpired && !isSubmitting) {
    return (
      <EmptyState
        eventSlug={event.slug}
        title="Tu reserva expiró"
        description="Liberamos tus entradas porque pasaron 10 minutos. Vuelve a elegirlas para continuar."
      />
    );
  }

  const totalLabel = formatEventPrice(total, event.currency);
  const payLabel = isSubmitting ? "Procesando…" : `Pagar ${totalLabel}`;
  const isPayDisabled = !values.acceptTerms || isSubmitting || !isReady;

  function update<K extends keyof Values>(key: K, value: Values[K]) {
    const next = { ...values, [key]: value };
    setValues(next);
    // After the first submit, errors follow the user's edits.
    if (wasSubmitted) setErrors(getBuyerErrors(next));
  }

  function inputProps(field: BuyerField) {
    return {
      id: field,
      name: field,
      "aria-required": true,
      "aria-invalid": errors[field] ? true : undefined,
      "aria-describedby": errors[field] ? `${field}-error` : undefined,
    };
  }

  async function handleSubmit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (isSubmitting) return;
    setWasSubmitted(true);
    const nextErrors = getBuyerErrors(values);
    setErrors(nextErrors);

    const firstInvalid = FIELD_ORDER.find((field) => nextErrors[field]);
    if (firstInvalid) {
      document.getElementById(firstInvalid)?.focus();
      return;
    }

    const buyer = {
      fullName: values.fullName.trim(),
      email: values.email.trim(),
      documentType: values.documentType,
      documentNumber: values.documentNumber.trim(),
      phone: values.phone.trim(),
    };
    const started: { orderCode?: string } = {};

    setPaymentError(null);
    setIsSubmitting(true);
    const outcome = await pay({
      startCheckout: async () => {
        const result = await startCheckoutAction({ slug: event.slug, ...buyer, acceptTerms: true });
        if (!result.ok) return result;
        started.orderCode = result.data.orderCode;
        return { ok: true, payment: result.data.payment };
      },
      returnUrl: `${window.location.origin}/events/${event.slug}/confirmation`,
      billing: { name: buyer.fullName, email: buyer.email, phone: buyer.phone },
    });

    if (!outcome.ok || !started.orderCode) {
      setPaymentError(outcome.ok ? PAYMENT_MESSAGES.generic : outcome.error);
      setIsSubmitting(false);
      return;
    }

    // Transitory until the payments webhook: the local confirmation uses the real order code.
    confirmOrder(
      { eventId: event.id, lines, currency: event.currency, method: "card", buyerName: buyer.fullName, email: buyer.email },
      started.orderCode,
    );
    setIsPaid(true);
    router.push(`/events/${event.slug}/confirmation`);
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="mx-auto flex max-w-7xl flex-col gap-4 p-4 md:px-6 lg:gap-6 lg:pt-6 lg:pb-20"
    >
      <ReservationTimer expiresAt={Date.parse(reservation.expiresAt)} onExpire={handleExpire} />

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
              <FormField id="fullName" label="Nombre completo" error={errors.fullName}>
                <Input
                  {...inputProps("fullName")}
                  autoComplete="name"
                  placeholder="Como figura en tu documento"
                  value={values.fullName}
                  onChange={(e) => update("fullName", e.target.value)}
                  className={FIELD_CLASS}
                />
              </FormField>
              <FormField id="email" label="Correo electrónico" error={errors.email}>
                <Input
                  {...inputProps("email")}
                  type="email"
                  autoComplete="email"
                  placeholder="tu@email.com"
                  value={values.email}
                  onChange={(e) => update("email", e.target.value)}
                  className={FIELD_CLASS}
                />
              </FormField>
              <FormField id="documentNumber" label="Documento de identidad" error={errors.documentNumber}>
                <div className="flex gap-2">
                  <Select
                    value={values.documentType}
                    onValueChange={(next) => update("documentType", next as Values["documentType"])}
                  >
                    <SelectTrigger aria-label="Tipo de documento" className={cn(FIELD_CLASS, "w-[104px] shrink-0 px-2.5 py-0 lg:w-[110px]")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {DOCUMENT_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    {...inputProps("documentNumber")}
                    inputMode={values.documentType === "dni" ? "numeric" : "text"}
                    placeholder="Número"
                    value={values.documentNumber}
                    onChange={(e) => update("documentNumber", e.target.value)}
                    className={FIELD_CLASS}
                  />
                </div>
              </FormField>
              <FormField id="phone" label="Celular" error={errors.phone}>
                <Input
                  {...inputProps("phone")}
                  type="tel"
                  autoComplete="tel"
                  placeholder="Número de celular"
                  value={values.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  className={FIELD_CLASS}
                />
              </FormField>
            </div>
          </section>

          <section className={CARD_CLASS}>
            <h2 className="text-lg font-semibold lg:text-xl">Pago con tarjeta</h2>
            <CardPaymentElement />
            {paymentError && (
              <p role="alert" className="text-[13px] font-medium text-destructive">
                {paymentError}
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
          <PayButton label={payLabel} disabled={isPayDisabled} className="h-14 rounded-2xl text-base" />
          {!values.acceptTerms && (
            <p className="-mt-2 text-center text-[13px] text-muted-foreground">Acepta los términos para continuar.</p>
          )}
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t border-border bg-background px-4 pt-3 pb-5 shadow-[0_-12px_24px_-18px_rgba(24,24,27,0.35)] lg:hidden">
        {paymentError && (
          <p role="alert" className="text-center text-[13px] font-medium text-destructive">
            {paymentError}
          </p>
        )}
        <PayButton label={payLabel} disabled={isPayDisabled} className="h-[54px] rounded-2xl text-base" />
        {!values.acceptTerms && (
          <p className="text-center text-xs text-muted-foreground">Acepta los términos para continuar.</p>
        )}
      </div>
    </form>
  );
}
