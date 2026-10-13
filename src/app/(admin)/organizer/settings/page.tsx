import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectStatusCard } from "@/modules/organizer/components/ConnectStatusCard";
import { OrganizerProfileForm } from "@/modules/organizer/components/OrganizerProfileForm";
import { refreshConnectStatus } from "@/modules/payment/services/connect-service";
import { requireRole } from "@/modules/user/current-user";
import { findOrganizerByUserId } from "@/modules/user/services/user-service";

export const metadata: Metadata = { title: "Configuración — Ticketera" };

export default async function OrganizerSettingsPage({ searchParams }: PageProps<"/organizer/settings">) {
  const user = await requireRole("organizer");
  const { connect } = await searchParams;

  // Back from the hosted onboarding the webhook may not have arrived yet: sync once, and fall back to the stored state.
  if (connect === "return") {
    try {
      await refreshConnectStatus(user);
    } catch (error) {
      console.error("[connect] sync on return failed", { error: error instanceof Error ? error.message : "unknown error" });
    }
  }

  const organizer = await findOrganizerByUserId(user.id);
  // Admins have no organizer profile to configure.
  if (!organizer) redirect("/organizer");

  return (
    <div className="flex max-w-2xl flex-col gap-5 lg:gap-8">
      <div className="flex flex-col gap-1 lg:gap-1.5">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight lg:text-4xl">Configuración</h1>
        <p className="text-sm text-muted-foreground lg:text-[15px]">Tu perfil de organizador y tus pagos.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Perfil</CardTitle>
          <CardDescription>Estos datos identifican a tu negocio. El RUC es necesario para configurar tus pagos.</CardDescription>
        </CardHeader>
        <CardContent>
          <OrganizerProfileForm defaultBusinessName={organizer.businessName} defaultTaxId={organizer.taxId ?? ""} />
        </CardContent>
      </Card>

      <ConnectStatusCard status={organizer.stripeOnboardingStatus} hasTaxId={Boolean(organizer.taxId)} />
    </div>
  );
}
