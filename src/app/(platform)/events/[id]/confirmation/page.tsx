import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CheckoutHeader } from "@/modules/booking/components/CheckoutHeader";
import { OrderConfirmation } from "@/modules/booking/components/OrderConfirmation";
import { getEventById } from "@/modules/event/services/event-service";

export const metadata: Metadata = { title: "Compra confirmada — Ticketera" };

export default async function ConfirmationPage({ params }: PageProps<"/events/[id]/confirmation">) {
  const { id } = await params;
  const event = await getEventById(id);
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
