import type { Metadata } from "next";
import Link from "next/link";
import { Heart } from "lucide-react";

import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { EventGrid } from "@/modules/event/components/EventGrid";
import { listPublicEventsByIds } from "@/modules/event/services/event-public-service";
import { listFavoriteEventIds } from "@/modules/favorite/services/favorite-service";
import { requireRole } from "@/modules/user/current-user";

export const metadata: Metadata = { title: "Mis favoritos — Ticketera" };

export default async function FavoritesPage() {
  const user = await requireRole("customer");
  // ponytail: favorites of events that are no longer public (past, cancelled) are hidden, not deleted.
  const events = await listPublicEventsByIds(await listFavoriteEventIds(user.id));

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-12 md:px-6 lg:pt-10 lg:pb-20">
        <h1 className="mb-6 text-[28px] leading-tight font-bold tracking-tight lg:text-[40px]">Mis favoritos</h1>
        {events.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-3xl border-[1.5px] border-dashed border-zinc-300 bg-card px-5 py-12 text-center lg:py-[72px]">
            <Heart className="size-6 text-primary" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Aún no tienes favoritos</h2>
            <p className="max-w-[420px] text-sm text-muted-foreground">
              Toca el corazón en un evento para guardarlo aquí.
            </p>
            <Link
              href="/events"
              className="mt-2 flex h-12 items-center rounded-[14px] bg-foreground px-5 text-[15px] font-semibold text-background focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Explorar eventos
            </Link>
          </div>
        ) : (
          <EventGrid events={events} />
        )}
      </main>
      <Footer />
    </div>
  );
}
