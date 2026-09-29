"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import { usePersistHydration } from "@/lib/use-persist-hydration";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { EventCard } from "@/modules/event/components/EventCard";
import type { Event } from "@/modules/event/event.types";
import { getCreateEventErrors, getLowestPrice } from "@/modules/organizer/create-event.schema";
import { useOrganizerStore } from "@/modules/organizer/organizer.store";
import type { CreateEventInput, OrganizerEventStatus } from "@/modules/organizer/organizer.types";
import { CoverImageInput } from "@/modules/organizer/components/CoverImageInput";
import { TicketTypesEditor, ticketFieldId } from "@/modules/organizer/components/TicketTypesEditor";

interface CreateEventFormProps {
  categories: string[];
}

const FIELD_CLASS = "h-[52px] rounded-[14px] border-zinc-300 bg-background px-4 text-base md:text-[15px]";
const CARD_CLASS = "flex flex-col gap-4 rounded-[20px] border border-border bg-card px-4 py-5 lg:gap-5 lg:rounded-3xl lg:p-7";

/** Focus order for the first invalid field. */
const FIELD_ORDER = ["name", "category", "date", "time", "venue", "city"];

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className={CARD_CLASS}>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold lg:text-xl">{title}</h2>
        {description && <p className="text-[13px] text-muted-foreground lg:text-sm">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Create-event form with a live preview of the listing card. Drafts need only
 * a name; publishing needs everything a buyer sees. Saved events go to the
 * organizer store (kept in this browser).
 */
export function CreateEventForm({ categories }: CreateEventFormProps) {
  const router = useRouter();
  // Saving before the stored events load would overwrite them.
  const hydrated = usePersistHydration(useOrganizerStore);
  const saveEvent = useOrganizerStore((state) => state.saveEvent);
  const [values, setValues] = useState<CreateEventInput>({
    name: "",
    category: categories[0] ?? "",
    description: "",
    date: "",
    time: "",
    venue: "",
    city: "",
    imageUrl: "",
    ticketTypes: [
      { name: "", price: "", quantity: "" },
      { name: "", price: "", quantity: "" },
    ],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastAttempt, setLastAttempt] = useState<OrganizerEventStatus | null>(null);

  function update(next: CreateEventInput) {
    setValues(next);
    if (lastAttempt) setErrors(getCreateEventErrors(next, lastAttempt));
  }

  function set<K extends keyof CreateEventInput>(key: K, value: CreateEventInput[K]) {
    update({ ...values, [key]: value });
  }

  function fieldProps(field: string) {
    return {
      id: field,
      name: field,
      "aria-required": true,
      "aria-invalid": errors[field] ? true : undefined,
      "aria-describedby": errors[field] ? `${field}-error` : undefined,
    };
  }

  function submit(status: OrganizerEventStatus) {
    setLastAttempt(status);
    const nextErrors = getCreateEventErrors(values, status);
    setErrors(nextErrors);

    const firstField = FIELD_ORDER.find((field) => nextErrors[field]);
    const firstTicket = Object.keys(nextErrors).find((key) => key.startsWith("ticketTypes."));
    if (firstField || firstTicket) {
      const [, index, field] = (firstTicket ?? "").split(".");
      const id = firstField ?? ticketFieldId(Number(index), field as "name");
      document.getElementById(id)?.focus();
      return;
    }

    saveEvent(values, status);
    router.push("/organizer");
  }

  const previewEvent: Event = {
    id: "preview",
    title: values.name.trim() || "Nombre del evento",
    category: values.category,
    imageUrl: values.imageUrl,
    imageAlt: "",
    date: values.date,
    venue: values.venue.trim() || "Lugar",
    city: values.city.trim() || "Ciudad",
    priceFrom: getLowestPrice(values.ticketTypes) ?? 0,
    currency: "PEN",
    status: "available",
    featured: false,
  };

  return (
    <div className="flex flex-col gap-5 lg:gap-7">
      <div className="flex flex-col gap-2">
        <Link
          href="/organizer"
          className="flex h-8 w-fit items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Mis eventos
        </Link>
        <h1 className="text-[28px] leading-tight font-bold tracking-tight lg:text-4xl">Crear evento</h1>
        <p className="text-sm text-muted-foreground">
          Los campos con{" "}
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
          <span className="sr-only">asterisco</span> son obligatorios para publicar. Un borrador solo necesita el nombre.
        </p>
      </div>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          submit("published");
        }}
        className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start xl:gap-8"
      >
        <div className="flex flex-col gap-5 lg:gap-6">
          <Section title="Información básica">
            <FormField id="name" label="Nombre del evento" error={errors.name}>
              <Input
                {...fieldProps("name")}
                placeholder="Ej. Festival de verano 2026"
                value={values.name}
                onChange={(e) => set("name", e.target.value)}
                className={FIELD_CLASS}
              />
            </FormField>
            <FormField id="category" label="Categoría" error={errors.category}>
              <select
                {...fieldProps("category")}
                value={values.category}
                onChange={(e) => set("category", e.target.value)}
                className={cn(FIELD_CLASS, "cursor-pointer border outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50")}
              >
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </FormField>
            <FormField id="description" label="Descripción" required={false}>
              <textarea
                id="description"
                rows={4}
                placeholder="Cuenta de qué trata el evento, quiénes se presentan y qué incluye la entrada."
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
                className="min-h-28 rounded-[14px] border border-zinc-300 bg-background px-4 py-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-[15px]"
              />
            </FormField>
          </Section>

          <Section title="Fecha y lugar">
            <div className="grid gap-4 sm:grid-cols-2 lg:gap-x-5 lg:gap-y-[18px]">
              <FormField id="date" label="Fecha" error={errors.date}>
                <Input {...fieldProps("date")} type="date" value={values.date} onChange={(e) => set("date", e.target.value)} className={FIELD_CLASS} />
              </FormField>
              <FormField id="time" label="Hora de inicio" error={errors.time}>
                <Input {...fieldProps("time")} type="time" value={values.time} onChange={(e) => set("time", e.target.value)} className={FIELD_CLASS} />
              </FormField>
              <FormField id="venue" label="Lugar" error={errors.venue}>
                <Input
                  {...fieldProps("venue")}
                  placeholder="Ej. Estadio Nacional"
                  value={values.venue}
                  onChange={(e) => set("venue", e.target.value)}
                  className={FIELD_CLASS}
                />
              </FormField>
              <FormField id="city" label="Ciudad" error={errors.city}>
                <Input
                  {...fieldProps("city")}
                  autoComplete="address-level2"
                  placeholder="Ej. Lima"
                  value={values.city}
                  onChange={(e) => set("city", e.target.value)}
                  className={FIELD_CLASS}
                />
              </FormField>
            </div>
          </Section>

          <Section title="Imagen de portada">
            <CoverImageInput value={values.imageUrl} onChange={(imageUrl) => set("imageUrl", imageUrl)} />
          </Section>

          <Section title="Tipos de entrada" description="Cada tipo tiene su precio y su cantidad disponible.">
            <TicketTypesEditor value={values.ticketTypes} errors={errors} onChange={(ticketTypes) => set("ticketTypes", ticketTypes)} />
          </Section>
        </div>

        <aside aria-label="Vista previa" className="flex flex-col gap-3 xl:sticky xl:top-6">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Vista previa</span>
          <div className="bg-muted">
            <EventCard event={previewEvent} preview />
          </div>
          <p className="text-[13px] text-muted-foreground">Así verán tu evento los compradores en el listado.</p>

          <div className="mt-2 grid grid-cols-2 gap-2.5 xl:grid-cols-1">
            <Button
              type="button"
              variant="outline"
              disabled={!hydrated}
              onClick={() => submit("draft")}
              className="h-[52px] cursor-pointer rounded-[14px] border-[1.5px] border-zinc-300 text-[15px] font-semibold"
            >
              Guardar borrador
            </Button>
            <Button type="submit" disabled={!hydrated} className="h-[52px] cursor-pointer rounded-[14px] text-[15px] font-semibold">
              Publicar evento
            </Button>
          </div>
        </aside>
      </form>
    </div>
  );
}
