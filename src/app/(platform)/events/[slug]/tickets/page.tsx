import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CheckoutHeader } from "@/modules/booking/components/CheckoutHeader";
import { TicketSelection } from "@/modules/booking/components/TicketSelection";
import { getEventVenueMap } from "@/modules/booking/services/venue-map-service";
import { getPublicEventDetail } from "@/modules/event/services/event-public-service";

export async function generateMetadata({ params }: PageProps<"/events/[slug]/tickets">): Promise<Metadata> {
  const event = await getPublicEventDetail((await params).slug);
  return event ? { title: `Entradas para ${event.title} — Ticketera` } : {};
}

export default async function TicketsPage({ params }: PageProps<"/events/[slug]/tickets">) {
  const event = await getPublicEventDetail((await params).slug);
  if (!event) notFound();

  const venue = await getEventVenueMap(event);

  return (
    <div className="flex min-h-full flex-col bg-muted pb-28 lg:pb-0">
      <CheckoutHeader currentStep={1} backHref={`/events/${event.slug}`} backLabel="Volver al evento" />
      <main className="flex-1">
        <TicketSelection event={event} venue={venue} />
      </main>
    </div>
  );
}
