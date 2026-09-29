import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { getVenueMap } from "@/modules/booking/services/venue-service";
import { EventDetailHero } from "@/modules/event/components/EventDetailHero";
import { EventGrid } from "@/modules/event/components/EventGrid";
import { EventInfoGrid } from "@/modules/event/components/EventInfoGrid";
import { PurchaseCard } from "@/modules/event/components/PurchaseCard";
import { TicketTierList } from "@/modules/event/components/TicketTierList";
import { VenueCard } from "@/modules/event/components/VenueCard";
import {
  getCategories,
  getEventById,
  getRelatedEvents,
} from "@/modules/event/services/event-service";

export async function generateMetadata({ params }: PageProps<"/events/[id]">): Promise<Metadata> {
  const event = await getEventById((await params).id);
  return event ? { title: `${event.title} — Ticketera`, description: event.description } : {};
}

const SECTION_TITLE_CLASS = "text-xl font-bold tracking-tight lg:text-2xl";

export default async function EventDetailPage({ params }: PageProps<"/events/[id]">) {
  const { id } = await params;
  const [event, venue, related, categories] = await Promise.all([
    getEventById(id),
    getVenueMap(id),
    getRelatedEvents(id),
    getCategories(),
  ]);
  if (!event || !venue) notFound();

  const category = categories.find((item) => item.label === event.category);

  return (
    <div className="flex min-h-full flex-col pb-28 lg:pb-0">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-4 md:px-6">
          <nav aria-label="Ruta" className="hidden pt-6 pb-5 lg:block">
            <ol className="flex items-center gap-2 text-sm text-muted-foreground">
              <li>
                <Link href="/" className="hover:text-foreground">
                  Inicio
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li>
                <Link
                  href={category ? `/?categoria=${category.id}#eventos` : "/#eventos"}
                  className="hover:text-foreground"
                >
                  {event.category}
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li aria-current="page" className="font-medium text-foreground">
                {event.title}
              </li>
            </ol>
          </nav>

          <div className="pt-3 lg:pt-0">
            <EventDetailHero event={event} />
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-8 pt-8 pb-10 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-14 lg:pt-14 lg:pb-18">
            <div className="flex flex-col gap-8 lg:gap-12">
              <section className="flex flex-col gap-3 lg:gap-4">
                <h2 className={SECTION_TITLE_CLASS}>Acerca del evento</h2>
                <p className="text-[15px] leading-relaxed text-zinc-600 lg:text-base">{event.description}</p>
              </section>

              <section className="flex flex-col gap-3 lg:gap-4">
                <h2 className={SECTION_TITLE_CLASS}>Información importante</h2>
                <EventInfoGrid event={event} />
              </section>

              <section className="flex flex-col gap-2 lg:hidden">
                <h2 className={SECTION_TITLE_CLASS}>Entradas</h2>
                <TicketTierList zones={venue.zones} />
              </section>

              <section className="flex flex-col gap-3 lg:gap-4">
                <h2 className={SECTION_TITLE_CLASS}>Lugar</h2>
                <VenueCard event={event} />
              </section>
            </div>

            <PurchaseCard event={event} zones={venue.zones} />
          </div>
        </div>

        {related.length > 0 && (
          <section className="bg-muted">
            <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:py-16">
              <SectionHeading
                title="También te puede interesar"
                description="Más eventos que podrían gustarte."
              />
              <div className="mt-5 lg:mt-8">
                <EventGrid events={related} />
              </div>
            </div>
          </section>
        )}
      </main>
      <Footer />
    </div>
  );
}
