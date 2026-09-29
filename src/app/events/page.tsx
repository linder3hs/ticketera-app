import type { Metadata } from "next";
import Link from "next/link";
import { SearchX } from "lucide-react";

import { Footer } from "@/components/Footer";
import { SiteHeader } from "@/components/SiteHeader";
import { ActiveFilterChips } from "@/modules/event/components/ActiveFilterChips";
import { EventFilters } from "@/modules/event/components/EventFilters";
import { EventGrid } from "@/modules/event/components/EventGrid";
import { EventSearchForm } from "@/modules/event/components/EventSearchForm";
import { SortToggle } from "@/modules/event/components/SortToggle";
import { getFacetCounts, getMonthOptions, parseSearchParams } from "@/modules/event/event-search";
import {
  getCategories,
  getCities,
  getUpcomingEvents,
  searchEvents,
} from "@/modules/event/services/event-service";

export const metadata: Metadata = {
  title: "Explora eventos — Ticketera",
  description: "Busca conciertos, deportes, teatro y festivales por ciudad, fecha y precio.",
};

export default async function EventsPage({ searchParams }: PageProps<"/events">) {
  const filters = parseSearchParams(await searchParams);
  const [results, catalog, categories, cities] = await Promise.all([
    searchEvents(filters),
    getUpcomingEvents(),
    getCategories(),
    getCities(),
  ]);
  const months = getMonthOptions(catalog);

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="flex-1">
        <section className="border-b border-zinc-100 bg-background">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 md:px-6 lg:flex-row lg:items-center lg:justify-between lg:py-10">
            <h1 className="text-[28px] leading-tight font-bold tracking-tight lg:text-[40px]">Explora eventos</h1>
            {/* Remount when the URL changes, so removed chips clear the form too. */}
            <EventSearchForm key={`${filters.q}|${filters.price}|${filters.from}`} filters={filters} />
          </div>
        </section>

        <div className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-5 px-4 pt-5 pb-12 md:px-6 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10 lg:pt-10 lg:pb-20">
          <EventFilters
            categories={categories}
            cities={cities}
            months={months}
            counts={getFacetCounts(catalog, categories)}
            resultCount={results.length}
          />

          <section aria-label="Resultados" className="flex flex-col gap-5 lg:gap-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="flex flex-col gap-3">
                <p aria-live="polite" className="text-[15px] font-semibold">
                  {results.length === 1 ? "1 evento" : `${results.length} eventos`}
                </p>
                <ActiveFilterChips categories={categories} months={months} />
              </div>
              <SortToggle />
            </div>

            {results.length > 0 ? (
              <EventGrid events={results} columns={3} />
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-3xl border-[1.5px] border-dashed border-zinc-300 bg-card px-5 py-12 text-center lg:py-[72px]">
                <span className="flex size-14 items-center justify-center rounded-[18px] bg-indigo-50 text-primary">
                  <SearchX className="size-6" aria-hidden="true" />
                </span>
                <h2 className="text-lg font-semibold lg:text-xl">No encontramos eventos con esos filtros</h2>
                <p className="max-w-[420px] text-sm leading-relaxed text-muted-foreground lg:text-[15px]">
                  Prueba quitando algún filtro o buscando otra ciudad.
                </p>
                <Link
                  href="/events"
                  className="mt-2 flex h-12 items-center rounded-[14px] bg-foreground px-5 text-[15px] font-semibold text-background focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  Limpiar filtros
                </Link>
              </div>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
