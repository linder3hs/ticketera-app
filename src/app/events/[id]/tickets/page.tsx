import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CheckoutHeader } from "@/modules/booking/components/CheckoutHeader";
import { TicketSelection } from "@/modules/booking/components/TicketSelection";
import { getVenueMap } from "@/modules/booking/services/venue-service";
import { getEventById } from "@/modules/event/services/event-service";

export async function generateMetadata({ params }: PageProps<"/events/[id]/tickets">): Promise<Metadata> {
  const event = await getEventById((await params).id);
  return event ? { title: `Entradas para ${event.title} — Ticketera` } : {};
}

export default async function TicketsPage({ params }: PageProps<"/events/[id]/tickets">) {
  const { id } = await params;
  const [event, venue] = await Promise.all([getEventById(id), getVenueMap(id)]);
  if (!event || !venue) notFound();

  return (
    <div className="flex min-h-full flex-col bg-muted pb-28 lg:pb-0">
      <CheckoutHeader currentStep={1} backHref={`/events/${id}`} backLabel="Volver al evento" />
      <main className="flex-1">
        <TicketSelection event={event} venue={venue} />
      </main>
    </div>
  );
}
