import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CheckoutForm } from "@/modules/booking/components/CheckoutForm";
import { CheckoutHeader } from "@/modules/booking/components/CheckoutHeader";
import { getVenueMap } from "@/modules/booking/services/venue-service";
import { getEventById } from "@/modules/event/services/event-service";

export const metadata: Metadata = { title: "Datos y pago — Ticketera" };

export default async function CheckoutPage({ params }: PageProps<"/events/[id]/checkout">) {
  const { id } = await params;
  const [event, venue] = await Promise.all([getEventById(id), getVenueMap(id)]);
  if (!event || !venue) notFound();

  return (
    <div className="flex min-h-full flex-col bg-muted pb-32 lg:pb-0">
      <CheckoutHeader currentStep={2} backHref={`/events/${id}/tickets`} backLabel="Volver a entradas" />
      <main className="flex-1">
        <CheckoutForm event={event} zones={venue.zones} />
      </main>
    </div>
  );
}
