import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CheckoutForm } from "@/modules/booking/components/CheckoutForm";
import { CheckoutHeader } from "@/modules/booking/components/CheckoutHeader";
import { getEventVenueMap } from "@/modules/booking/services/venue-map-service";
import { getPublicEventDetail } from "@/modules/event/services/event-public-service";

export const metadata: Metadata = { title: "Datos y pago — Ticketera" };

export default async function CheckoutPage({ params }: PageProps<"/events/[slug]/checkout">) {
  const event = await getPublicEventDetail((await params).slug);
  if (!event) notFound();

  const venue = await getEventVenueMap(event);

  return (
    <div className="flex min-h-full flex-col bg-muted pb-32 lg:pb-0">
      <CheckoutHeader currentStep={2} backHref={`/events/${event.slug}/tickets`} backLabel="Volver a entradas" />
      <main className="flex-1">
        <CheckoutForm event={event} zones={venue.zones} />
      </main>
    </div>
  );
}
