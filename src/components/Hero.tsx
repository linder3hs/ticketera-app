import { EventSearchForm } from "@/modules/event/components/EventSearchForm";
import { FeaturedEventsCarousel } from "@/modules/event/components/FeaturedEventsCarousel";
import type { Event } from "@/modules/event/event.types";

interface HeroProps {
  events: Event[];
}

export function Hero({ events }: HeroProps) {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 pt-6 pb-6 md:px-6 lg:pt-11">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
        <div className="flex max-w-[560px] flex-col gap-2.5 lg:gap-3">
          <h1 className="text-[30px] leading-[1.12] font-bold tracking-tight text-balance lg:text-5xl lg:leading-[1.08]">
            Encuentra tu próximo plan en vivo
          </h1>
          <p className="text-[15px] leading-relaxed text-muted-foreground lg:text-[17px]">
            Conciertos, deportes, teatro y festivales. Compra seguro y recibe tu
            entrada al instante.
          </p>
        </div>
        <EventSearchForm />
      </div>

      <div className="mt-6 lg:mt-7">
        <FeaturedEventsCarousel events={events} />
      </div>
    </section>
  );
}
