"use client";

import { useCallback } from "react";
import { useElements, useStripe } from "@stripe/react-stripe-js";

import type { ConfirmationOutcome, PreparedPayment } from "@/modules/payment/payment.types";
import { PAYMENT_MESSAGES, resolveConfirmation } from "@/modules/payment/payment.utils";

/** Buyer data captured by our form, sent to Stripe as the card's billing details. */
export interface PaymentBilling {
  name: string;
  email: string;
  phone: string;
}

export type StartCheckoutOutcome = { ok: true; payment: PreparedPayment } | { ok: false; error: string };

interface PayInput {
  /** Creates (or resumes) the order and its PaymentIntent on the server. */
  startCheckout: () => Promise<StartCheckoutOutcome>;
  returnUrl: string;
  billing: PaymentBilling;
}

/**
 * Pays with the Payment Element of the surrounding `CardPaymentProvider`: validates the element,
 * asks the server for the PaymentIntent, and confirms it in the page (3DS in a modal, no redirect).
 * `ok` means the PaymentIntent ended `succeeded` or `processing`.
 */
export function useCheckoutPayment() {
  const stripe = useStripe();
  const elements = useElements();

  const pay = useCallback(
    async ({ startCheckout, returnUrl, billing }: PayInput): Promise<ConfirmationOutcome> => {
      if (!stripe || !elements) return { ok: false, error: PAYMENT_MESSAGES.generic };
      try {
        // Must come first: Stripe validates the element before anything async happens.
        const { error: submitError } = await elements.submit();
        if (submitError) return { ok: false, error: submitError.message ?? PAYMENT_MESSAGES.generic };

        const started = await startCheckout();
        if (!started.ok) return { ok: false, error: started.error };
        if (started.payment.state !== "requires_payment") return { ok: true };

        const result = await stripe.confirmPayment({
          elements,
          clientSecret: started.payment.clientSecret,
          confirmParams: { return_url: returnUrl, payment_method_data: { billing_details: billing } },
          redirect: "if_required",
        });
        return resolveConfirmation(result);
      } catch {
        return { ok: false, error: PAYMENT_MESSAGES.generic };
      }
    },
    [stripe, elements],
  );

  return { pay, isReady: Boolean(stripe && elements) };
}
