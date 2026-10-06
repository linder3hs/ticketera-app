import type { Metadata } from "next";

import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { MyTickets } from "@/modules/booking/components/MyTickets";
import { getMyOrders } from "@/modules/booking/services/order-service";
import type { EventDetail } from "@/modules/event/event.types";
import { getEventById, getUpcomingEvents } from "@/modules/event/services/event-service";

export const metadata: Metadata = { title: "Mis entradas — Ticketera" };

export default async function MyTicketsPage() {
  const [catalog, sampleOrders] = await Promise.all([getUpcomingEvents(), getMyOrders()]);
  const details = await Promise.all(catalog.map((event) => getEventById(event.id)));
  const events = Object.fromEntries(
    details.filter((event): event is EventDetail => Boolean(event)).map((event) => [event.id, event]),
  );

  return (
    <div className="flex min-h-full flex-col bg-muted">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-12 md:px-6 lg:pt-10 lg:pb-20">
        <MyTickets events={events} sampleOrders={sampleOrders} />
      </main>
      <Footer />
    </div>
  );
}
