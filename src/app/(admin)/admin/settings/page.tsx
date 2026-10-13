import type { Metadata } from "next";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlatformFeeForm } from "@/modules/payment/components/PlatformFeeForm";
import { getPlatformFeePercent } from "@/modules/payment/services/platform-fee-service";
import { requireRole } from "@/modules/user/current-user";

export const metadata: Metadata = { title: "Ajustes de plataforma — Ticketera" };

export default async function AdminSettingsPage() {
  await requireRole("super_admin");
  const percent = await getPlatformFeePercent();

  return (
    <div className="flex max-w-2xl flex-col gap-5 lg:gap-8">
      <div className="flex flex-col gap-1 lg:gap-1.5">
        <h1 className="text-[28px] leading-tight font-bold tracking-tight lg:text-4xl">Ajustes de plataforma</h1>
        <p className="text-sm text-muted-foreground lg:text-[15px]">Parámetros globales de Ticketera.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-semibold">Comisión</CardTitle>
          <CardDescription>Se aplica a las compras nuevas. Las órdenes ya creadas conservan la comisión con la que se cobraron.</CardDescription>
        </CardHeader>
        <CardContent>
          <PlatformFeeForm defaultPercent={percent} />
        </CardContent>
      </Card>
    </div>
  );
}
