import type { Metadata } from "next";

import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { RefundPolicy } from "@/modules/refund/components/RefundPolicy";

export const metadata: Metadata = {
  title: "Política de reembolsos — Ticketera",
  description: "Cuándo y cómo se reembolsan tus entradas: evento cancelado, reprogramado, plazos y casos no reembolsables.",
};

export default function RefundPolicyPage() {
  return (
    <div className="flex min-h-full flex-col bg-muted">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-12 md:px-6 lg:pt-10 lg:pb-20">
        <RefundPolicy />
      </main>
      <Footer />
    </div>
  );
}
