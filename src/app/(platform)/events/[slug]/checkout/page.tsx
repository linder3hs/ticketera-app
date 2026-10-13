import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { CheckoutForm } from "@/modules/booking/components/CheckoutForm";
import { toBuyerDefaults } from "@/modules/booking/checkout.utils";
import { CheckoutHeader } from "@/modules/booking/components/CheckoutHeader";
import { getActiveReservation } from "@/modules/booking/services/reservation-service";
import { getPublicEventDetail } from "@/modules/event/services/event-public-service";
import { requireRole } from "@/modules/user/current-user";

export const metadata: Metadata = { title: "Datos y pago — Ticketera" };

export default async function CheckoutPage({ params }: PageProps<"/events/[slug]/checkout">) {
  const event = await getPublicEventDetail((await params).slug);
  if (!event) notFound();

  // Signed out goes to /sign-in and comes back here; without a live hold, back to picking tickets.
  const user = await requireRole("customer");
  const reservation = await getActiveReservation(user.id, event.id);
  if (!reservation) redirect(`/events/${event.slug}/tickets`);

  return (
    <div className="flex min-h-full flex-col bg-muted pb-32 lg:pb-0">
      <CheckoutHeader currentStep={2} backHref={`/events/${event.slug}/tickets`} backLabel="Volver a entradas" />
      <main className="flex-1">
        <CheckoutForm event={event} reservation={reservation} buyerDefaults={toBuyerDefaults(user)} />
      </main>
    </div>
  );
}
