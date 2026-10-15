import type { Metadata } from "next";

import { orderCodeSchema } from "@/modules/booking/order.schema";
import { CheckoutHeader } from "@/modules/booking/components/CheckoutHeader";
import { OrderConfirmation } from "@/modules/booking/components/OrderConfirmation";
import { findMyOrder } from "@/modules/booking/services/order-service";
import { requireRole } from "@/modules/user/current-user";

export const metadata: Metadata = { title: "Tu compra — Ticketera" };

export default async function ConfirmationPage({ searchParams }: PageProps<"/events/[slug]/confirmation">) {
  // Signed out goes to /sign-in and comes back here.
  const user = await requireRole("customer");

  // Without a valid `?order=` (or with someone else's) there is nothing to show: the view says "not found".
  const parsed = orderCodeSchema.safeParse((await searchParams).order);
  const order = parsed.success ? await findMyOrder(user.id, parsed.data) : null;

  return (
    <div className="flex min-h-full flex-col bg-muted">
      <CheckoutHeader currentStep={3} backHref="/" backLabel="Ir al inicio" />
      <main className="flex-1">
        <OrderConfirmation order={order} />
      </main>
    </div>
  );
}
