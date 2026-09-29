import { CreditCard, Search, Ticket } from "lucide-react";

import { SectionHeading } from "@/components/ui/SectionHeading";

const STEPS = [
  {
    icon: Search,
    title: "Buscar",
    description: "Encuentra el evento, artista o ciudad que te interesa.",
  },
  {
    icon: Ticket,
    title: "Elegir",
    description: "Selecciona tus entradas y la cantidad que necesitas.",
  },
  {
    icon: CreditCard,
    title: "Comprar",
    description: "Paga de forma segura y recibe tus entradas al instante.",
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="mx-auto max-w-7xl px-4 py-12 md:px-6 lg:pt-24 lg:pb-22">
      <SectionHeading
        title="Cómo funciona"
        description="Tres pasos y ya estás dentro."
        className="lg:items-center lg:text-center"
      />

      <ol className="mt-7 grid grid-cols-1 gap-6 lg:mt-14 lg:grid-cols-3 lg:gap-8">
        {STEPS.map((step, index) => (
          <li key={step.title} className="flex gap-4 lg:flex-col">
            <div className="flex items-center gap-4">
              <span className="flex size-[52px] shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-primary lg:size-16 lg:rounded-[20px]">
                <step.icon className="size-6 lg:size-7" aria-hidden="true" />
              </span>
              {index < STEPS.length - 1 && (
                <span className="hidden flex-1 border-t-[1.5px] border-dashed border-zinc-300 lg:block" />
              )}
            </div>
            <div className="flex flex-col gap-1 lg:gap-2">
              <span className="text-xs font-semibold text-primary lg:text-[13px]">
                Paso {index + 1}
              </span>
              <h3 className="text-[17px] font-semibold lg:text-xl">{step.title}</h3>
              <p className="max-w-[340px] text-sm leading-relaxed text-muted-foreground lg:text-[15px]">
                {step.description}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
