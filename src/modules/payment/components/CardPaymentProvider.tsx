"use client";

import type { ReactNode } from "react";
import { Elements, PaymentElement } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";

import { PAYMENT_MESSAGES } from "@/modules/payment/payment.utils";

// Created once at module scope: `loadStripe` must not run on every render.
const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

interface CardPaymentProviderProps {
  /** Amount shown to Stripe (minor units); must be greater than 0. */
  amountCents: number;
  /** Currency code of the amount, any case. */
  currency: string;
  children: ReactNode;
}

/** Stripe `Elements` context for a card-only payment (the PaymentIntent is created on submit). */
export function CardPaymentProvider({ amountCents, currency, children }: CardPaymentProviderProps) {
  if (!stripePromise) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {PAYMENT_MESSAGES.generic}
      </p>
    );
  }
  return (
    <Elements
      stripe={stripePromise}
      options={{
        mode: "payment",
        amount: amountCents,
        currency: currency.toLowerCase(),
        allowedPaymentMethodTypes: ["card"],
      }}
    >
      {children}
    </Elements>
  );
}

/**
 * The Payment Element, inside a `CardPaymentProvider`. Name, email and phone come from our own
 * form, so Stripe doesn't ask for them (they go in `confirmParams` via `useCheckoutPayment`).
 */
export function CardPaymentElement() {
  return (
    <PaymentElement
      options={{ fields: { billingDetails: { name: "never", email: "never", phone: "never" } } }}
    />
  );
}
