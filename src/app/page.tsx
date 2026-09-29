import { SiteHeader } from "@/components/SiteHeader";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { Newsletter } from "@/components/Newsletter";
import { Footer } from "@/components/Footer";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { CategoryCard } from "@/modules/event/components/CategoryCard";
import { CategoryChips } from "@/modules/event/components/CategoryChips";
import { EventGrid } from "@/modules/event/components/EventGrid";
import {
  getCategories,
  getFeaturedEvents,
  getUpcomingEvents,
} from "@/modules/event/services/event-service";

export default async function Home({ searchParams }: PageProps<"/">) {
  const { categoria } = await searchParams;
  const [categories, featuredEvents] = await Promise.all([
    getCategories(),
    getFeaturedEvents(),
  ]);
  // Unknown or repeated `categoria` values are ignored (no filter).
  const selectedCategory = categories.find((category) => category.id === categoria);
  const upcomingEvents = await getUpcomingEvents(selectedCategory?.id);

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Hero events={featuredEvents} />

        <section id="categorias" className="mx-auto max-w-7xl px-4 py-10 md:px-6 lg:pt-16 lg:pb-20">
          <SectionHeading
            title="Explora por categoría"
            description="Elige lo que te gusta y te mostramos lo que viene."
          />
          <div className="scroll-row mt-5 gap-3 lg:mx-0 lg:mt-8 lg:grid lg:grid-cols-8 lg:gap-4 lg:overflow-visible lg:px-0">
            {categories.map((category) => (
              <CategoryCard
                key={category.id}
                category={category}
                isSelected={category.id === selectedCategory?.id}
              />
            ))}
          </div>
        </section>

        <section id="eventos" className="bg-muted">
          <div className="mx-auto max-w-7xl px-4 py-10 md:px-6 lg:pt-20 lg:pb-22">
            <SectionHeading
              title="Próximos eventos"
              description="Ordenados por fecha. Asegura tu lugar antes de que se agoten."
            />
            <div className="mt-4 lg:mt-7">
              <CategoryChips categories={categories} selectedId={selectedCategory?.id} />
            </div>
            <div className="mt-5 lg:mt-8">
              <EventGrid
                events={upcomingEvents.slice(0, 8)}
                categoryLabel={selectedCategory?.label}
              />
            </div>
          </div>
        </section>

        <HowItWorks />
        <Newsletter />
      </main>
      <Footer />
    </div>
  );
}
