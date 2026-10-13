import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CheckoutHeader } from "@/modules/booking/components/CheckoutHeader";
import { OrderConfirmation } from "@/modules/booking/components/OrderConfirmation";
import { getPublicEventDetail } from "@/modules/event/services/event-public-service";

export const metadata: Metadata = { title: "Compra confirmada — Ticketera" };

export default async function ConfirmationPage({ params }: PageProps<"/events/[slug]/confirmation">) {
  const event = await getPublicEventDetail((await params).slug);
  if (!event) notFound();

  return (
    <div className="flex min-h-full flex-col bg-muted">
      <CheckoutHeader currentStep={3} backHref="/" backLabel="Ir al inicio" />
      <main className="flex-1">
        <OrderConfirmation event={event} />
      </main>
    </div>
  );
}
