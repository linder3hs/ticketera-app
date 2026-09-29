"use client";

import type { FormEvent } from "react";
import { Mail } from "lucide-react";

import { Button } from "@/components/ui/button";

export function Newsletter() {
  // Formulario mock: sin acción real todavía (ver docs/specs/event-landing-page.md).
  const handleSubscribeSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
  };

  return (
    <section className="mx-auto max-w-7xl px-4 pb-10 md:px-6 lg:pb-22">
      <div className="flex flex-col gap-5 rounded-3xl bg-indigo-50 px-5 py-7 lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:rounded-[32px] lg:px-16 lg:py-14">
        <div className="flex max-w-[520px] flex-col gap-2 lg:gap-2.5">
          <h2 className="text-[22px] leading-tight font-bold tracking-tight lg:text-[30px]">
            No te pierdas ningún evento
          </h2>
          <p className="text-sm leading-relaxed text-zinc-700 lg:text-base">
            Suscríbete y recibe las novedades de tus artistas y equipos
            favoritos.
          </p>
        </div>

        <form
          onSubmit={handleSubscribeSubmit}
          className="flex flex-col gap-2.5 sm:flex-row"
        >
          <label className="flex h-[52px] items-center gap-2.5 rounded-[14px] border border-indigo-200 bg-background px-4 text-muted-foreground focus-within:ring-3 focus-within:ring-ring/50 sm:w-[360px] lg:h-14 lg:rounded-2xl">
            <Mail className="size-5 shrink-0" aria-hidden="true" />
            <span className="sr-only">Correo electrónico</span>
            <input
              type="email"
              placeholder="tu@email.com"
              required
              className="w-full bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </label>
          <Button
            type="submit"
            className="h-[52px] cursor-pointer rounded-[14px] px-6 text-[15px] font-semibold lg:h-14 lg:rounded-2xl"
          >
            Suscribirme
          </Button>
        </form>
      </div>
    </section>
  );
}
