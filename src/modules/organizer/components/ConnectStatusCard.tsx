"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { startConnectOnboardingAction } from "@/modules/payment/actions";
import type { StripeOnboardingStatus } from "@/modules/user/user.types";

interface ConnectStatusCardProps {
  status: StripeOnboardingStatus;
  /** The RUC is a prerequisite of the onboarding (the server checks it too). */
  hasTaxId: boolean;
}

const STATUS_COPY: Record<
  StripeOnboardingStatus,
  { badge: string; variant: "secondary" | "outline" | "default"; description: string; action: string | null }
> = {
  not_started: {
    badge: "Sin configurar",
    variant: "secondary",
    description: "Conecta tu cuenta de pagos en Stripe para recibir el dinero de tus ventas y poder publicar eventos.",
    action: "Configurar pagos",
  },
  pending: {
    badge: "En proceso",
    variant: "outline",
    description: "Tu cuenta de pagos aún no está lista. Continúa el proceso en Stripe para terminarlo.",
    action: "Continuar onboarding",
  },
  complete: {
    badge: "Pagos configurados",
    variant: "default",
    description: "Tu cuenta de pagos está lista para recibir el dinero de tus ventas.",
    action: null,
  },
};

const TAX_ID_HELP_ID = "connect-tax-id-help";
const GENERIC_ERROR = "No pudimos iniciar la configuración de pagos. Intenta de nuevo.";

/** Payments (Stripe Connect) status of the organizer, with the button that starts or resumes the onboarding. */
export function ConnectStatusCard({ status, hasTaxId }: ConnectStatusCardProps) {
  const copy = STATUS_COPY[status];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setBusy(true);
    setError(null);
    try {
      const result = await startConnectOnboardingAction();
      if (result.ok) {
        // Keep the button disabled while the browser leaves for Stripe.
        window.location.assign(result.url);
        return;
      }
      setError(result.error);
    } catch {
      setError(GENERIC_ERROR);
    }
    setBusy(false);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-lg font-semibold">Pagos</CardTitle>
          <Badge variant={copy.variant}>{copy.badge}</Badge>
        </div>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      {copy.action && (
        <CardContent className="flex flex-col items-start gap-3">
          <Button
            onClick={handleStart}
            disabled={!hasTaxId || busy}
            aria-describedby={hasTaxId ? undefined : TAX_ID_HELP_ID}
            className="h-11 rounded-xl px-5 text-sm font-semibold"
          >
            {busy ? "Redirigiendo…" : copy.action}
          </Button>
          {!hasTaxId && (
            <p id={TAX_ID_HELP_ID} className="text-[13px] text-muted-foreground">
              Guarda tu RUC en el perfil para configurar tus pagos.
            </p>
          )}
          {error && (
            <p role="alert" className="text-[13px] font-medium text-destructive">
              {error}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
