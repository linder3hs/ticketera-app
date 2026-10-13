import type { Metadata } from "next";

import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { MyTickets } from "@/modules/booking/components/MyTickets";
import { listMyOrders } from "@/modules/booking/services/order-service";
import { toLimaDate } from "@/modules/event/event-list.utils";
import { requireRole } from "@/modules/user/current-user";

export const metadata: Metadata = { title: "Mis entradas — Ticketera" };

export default async function MyTicketsPage() {
  // Any signed-in user (customer is the lowest role); signed out goes to /sign-in.
  const user = await requireRole("customer");
  const orders = await listMyOrders(user.id);
  // Computed on the server so upcoming/past does not depend on the browser's time zone.
  const today = toLimaDate(new Date());

  return (
    <div className="flex min-h-full flex-col bg-muted">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-12 md:px-6 lg:pt-10 lg:pb-20">
        <MyTickets orders={orders} today={today} />
      </main>
      <Footer />
    </div>
  );
}
