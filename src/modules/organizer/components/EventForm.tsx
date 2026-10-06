"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CircleAlert, Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EventCard } from "@/modules/event/components/EventCard";
import type { Event } from "@/modules/event/event.types";
import { ZONE_CHANGE_MESSAGES } from "@/modules/event/event.policy";
import { getEventWriteErrors } from "@/modules/event/event-write.schema";
import type {
  EventForEdit,
  EventFormOptions,
  EventFormValues,
  EventIntent,
  OrganizerOption,
  EventZoneFormValues,
  VenueOption,
} from "@/modules/event/event-write.types";
import { parsePriceToCents } from "@/modules/event/event-write.utils";
import { useCreateEvent, useSetEventStatus, useUpdateEvent } from "@/modules/event/hooks/use-event-mutations";
import { CoverImageInput } from "@/modules/organizer/components/CoverImageInput";
import { FeaturedToggle } from "@/modules/organizer/components/FeaturedToggle";
import { TicketTypesEditor, zoneFieldId } from "@/modules/organizer/components/TicketTypesEditor";
import { useOrganizerStore } from "@/modules/organizer/organizer.store";

interface EventFormProps {
  options: EventFormOptions;
  /** Creating as an admin: who will own the event. Omit for organizers (the server uses their own profile). */
  organizers?: OrganizerOption[];
  /** The event to edit; omit to create a new one. */
  event?: EventForEdit;
  /** Only an approved organizer can publish (resolved on the server; the server re-checks). */
  canPublish: boolean;
}

/** `draft`/`publish` save then (for `publish`) publish; `save` only saves a published event. */
type SubmitMode = "draft" | "publish" | "save";

const FIELD_CLASS = "h-[52px] rounded-[14px] border-zinc-300 bg-background px-4 text-base md:text-[15px]";
const SELECT_CLASS = cn(FIELD_CLASS, "w-full py-0");
const CARD_CLASS = "flex flex-col gap-4 rounded-[20px] border border-border bg-card px-4 py-5 lg:gap-5 lg:rounded-3xl lg:p-7";

/** Focus order for the first invalid field. */
const FIELD_ORDER = ["organizerId", "title", "categoryId", "date", "time", "venueId", "coverImageUrl"];

const LOCKED_REASON_ID = "locked-reason";
const SALES_LOCK_REASON_ID = "sales-lock-reason";
const PUBLISH_REASON_ID = "publish-reason";

const EMPTY_VALUES: EventFormValues = {
  title: "",
  description: "",
  categoryId: "",
  venueId: "",
  date: "",
  time: "",
  coverImageUrl: "",
  zones: [],
};

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

/** One form row per zone of the venue, keeping what was already typed for it. */
function buildZones(venue: VenueOption | undefined, current: EventZoneFormValues[]): EventZoneFormValues[] {
  return (venue?.zones ?? []).map(
    (zone) =>
      current.find((row) => row.venueZoneId === zone.id) ?? {
        venueZoneId: zone.id,
        price: "",
        capacity: zone.seatingType === "general_admission" ? String(zone.capacity) : "",
      },
  );
}

/** Shared schema errors plus the zone limits only the venue knows (capacity range, occupancy). */
function validate(values: EventFormValues, intent: EventIntent, venue: VenueOption | undefined, occupied: Record<string, number>) {
  const errors = getEventWriteErrors(values, intent);

  venue?.zones.forEach((zone, index) => {
    const row = values.zones[index];
    const key = `zones.${index}.capacity`;
    if (!row || row.price.trim() === "" || zone.seatingType !== "general_admission" || errors[key]) return;

    const capacity = row.capacity.trim();
    if (capacity === "") errors[key] = "Indica la capacidad de la zona.";
    else if (Number(capacity) > zone.capacity) errors[key] = `La capacidad máxima de ${zone.name} es ${zone.capacity}.`;
    else if (Number(capacity) < (occupied[zone.id] ?? 0)) errors[key] = ZONE_CHANGE_MESSAGES.capacity_below_occupied;
  });

  return errors;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "No pudimos guardar el evento. Intenta de nuevo.";
}

function lowestPrice(zones: EventZoneFormValues[]): number {
  const prices = zones.map((zone) => parsePriceToCents(zone.price.trim())).filter((cents): cents is number => cents !== null && cents > 0);
  return prices.length > 0 ? Math.min(...prices) / 100 : 0;
}

/**
 * Create/edit form for an event with a live preview of the listing card. Venue
 * and category come from the DB; locked fields explain why. "Publicar" saves
 * the event and then publishes it (two server calls, see the spec's AC12).
 */
export function EventForm({ options, organizers, event, canPublish }: EventFormProps) {
  const router = useRouter();
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent();
  const setEventStatus = useSetEventStatus();
  const setNotice = useOrganizerStore((state) => state.setNotice);
  // A message left by the previous page (e.g. a failed publish): shown once, then cleared.
  const notice = useOrganizerStore((state) => state.notice);
  const [shownNotice] = useState(notice);
  useEffect(() => {
    useOrganizerStore.getState().clearNotice();
  }, []);

  const [organizerId, setOrganizerId] = useState("");
  const isPublished = event?.status === "published";
  const fieldsLocked = event !== undefined && (event.readOnly || !event.capabilities.edit);
  const hasSales = event?.hasSales ?? false;
  const occupied = Object.fromEntries((event?.zones ?? []).map((zone) => [zone.venueZoneId, zone.occupied]));

  const [values, setValues] = useState<EventFormValues>(() => {
    const initial = event?.values ?? EMPTY_VALUES;
    const venue = options.venues.find((item) => item.id === initial.venueId);
    return { ...initial, zones: buildZones(venue, initial.zones) };
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [lastAttempt, setLastAttempt] = useState<EventIntent | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const venue = options.venues.find((item) => item.id === values.venueId);
  const category = options.categories.find((item) => item.id === values.categoryId);

  function revalidate(next: EventFormValues) {
    if (lastAttempt) setErrors(validate(next, lastAttempt, options.venues.find((item) => item.id === next.venueId), occupied));
  }

  function update(next: EventFormValues) {
    setValues(next);
    revalidate(next);
  }

  function set<K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) {
    update({ ...values, [key]: value });
  }

  /** Changing the venue replaces the zones (the server rejects this when there are sales; the field is disabled then). */
  function changeVenue(venueId: string) {
    update({ ...values, venueId, zones: buildZones(options.venues.find((item) => item.id === venueId), []) });
  }

  /** Why a field is disabled, as the id of the paragraph that says it. */
  function reasonId(field: "date" | "time" | "venueId" | "other"): string | undefined {
    if (fieldsLocked) return LOCKED_REASON_ID;
    if (hasSales && field !== "other") return SALES_LOCK_REASON_ID;
    return undefined;
  }

  function isDisabled(field: "title" | "description" | "categoryId" | "startsAt" | "venueId") {
    return fieldsLocked || (event !== undefined && !event.editable[field]);
  }

  function fieldProps(field: string, reason: string | undefined, disabled: boolean) {
    return {
      id: field,
      name: field,
      disabled,
      "aria-required": true,
      "aria-invalid": errors[field] ? true : undefined,
      "aria-describedby": [errors[field] ? `${field}-error` : null, disabled ? reason : null].filter(Boolean).join(" ") || undefined,
    };
  }

  /** `fieldProps` split for a `Select`: `name`/`disabled` go on the root, the id and aria on the trigger. */
  function selectProps(field: string, reason: string | undefined, disabled: boolean) {
    const { name, disabled: isOff, ...trigger } = fieldProps(field, reason, disabled);
    return { root: { name, disabled: isOff }, trigger };
  }

  async function submit(mode: SubmitMode) {
    if (busy || fieldsLocked) return;
    const intent: EventIntent = mode === "draft" ? "draft" : "publish";
    setLastAttempt(intent);
    const nextErrors = validate(values, intent, venue, occupied);
    if (organizers && !event && !organizerId) nextErrors.organizerId = "Elige el organizador del evento.";
    setErrors(nextErrors);

    const keys = Object.keys(nextErrors);
    const firstField = FIELD_ORDER.find((field) => nextErrors[field]);
    const firstZone = keys.find((key) => key.startsWith("zones."));
    if (firstField || firstZone || nextErrors.zones) {
      const [, index, field] = (firstZone ?? "zones.0.price").split(".");
      document.getElementById(firstField ?? zoneFieldId(Number(index), field as "price"))?.focus();
      return;
    }

    setBusy(true);
    setSubmitError(null);
    const title = values.title.trim();

    let id = event?.id ?? "";
    try {
      if (event) await updateEvent.mutateAsync({ id: event.id, ...values });
      else id = (await createEvent.mutateAsync({ ...values, organizerId })).id;
    } catch (error) {
      setSubmitError(errorMessage(error));
      setBusy(false);
      return;
    }

    if (mode === "publish") {
      try {
        await setEventStatus.mutateAsync({ id, status: "published" });
      } catch (error) {
        const message = `Guardamos “${title}” como borrador, pero no se pudo publicar: ${errorMessage(error)}`;
        if (event) {
          setSubmitError(message);
          setBusy(false);
        } else {
          // The draft exists now: continue on its edit page, where the error is shown.
          setNotice(message);
          router.push(`/organizer/events/${id}/edit`);
        }
        return;
      }
    }

    setNotice(
      mode === "publish" ? `“${title}” se publicó.` : mode === "save" ? `Guardamos los cambios de “${title}”.` : `Guardamos “${title}” como borrador.`,
    );
    router.push("/organizer");
  }

  const previewEvent: Event = {
    id: "preview",
    title: values.title.trim() || "Nombre del evento",
    category: category?.label ?? "Categoría",
    imageUrl: values.coverImageUrl.trim().startsWith("https://") ? values.coverImageUrl.trim() : "",
    imageAlt: "",
    date: values.date,
    venue: venue?.name ?? "Lugar",
    city: venue?.city ?? "Ciudad",
    priceFrom: lowestPrice(values.zones),
    currency: "PEN",
    status: "available",
    featured: false,
  };

  const lockedMessage = event?.readOnly
    ? "Este evento ya empezó o fue cancelado, por eso solo puedes verlo."
    : "Tu perfil de organizador no está aprobado: solo puedes editar borradores.";
  const primaryMode: SubmitMode = isPublished ? "save" : canPublish ? "publish" : "draft";

  return (
    <div className="flex flex-col gap-5 lg:gap-7">
      <div className="flex flex-col gap-2">
        <Link
          href="/organizer"
          className="flex h-11 w-fit items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Mis eventos
        </Link>
        <h1 className="text-[28px] leading-tight font-bold tracking-tight lg:text-4xl">{event ? "Editar evento" : "Crear evento"}</h1>
        {/* Outside the <form>: it saves on its own and keeps unsaved field changes. */}
        {event?.capabilities.feature && (
          <FeaturedToggle eventId={event.id} title={event.values.title} featured={event.featured} published={isPublished} />
        )}
        {!fieldsLocked && (
          <p className="text-sm text-muted-foreground">
            Los campos con{" "}
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
            <span className="sr-only">asterisco</span> son obligatorios. Un borrador necesita nombre, categoría, recinto, fecha y hora; para publicar
            agrega además al menos una zona con precio.
          </p>
        )}
      </div>

      {fieldsLocked && (
        <p id={LOCKED_REASON_ID} role="status" className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          <Lock className="size-5 shrink-0" aria-hidden="true" />
          {lockedMessage}
        </p>
      )}

      {shownNotice && (
        <p role="alert" className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          <CircleAlert className="size-5 shrink-0" aria-hidden="true" />
          {shownNotice}
        </p>
      )}

      <form
        noValidate
        onSubmit={(formEvent) => {
          formEvent.preventDefault();
          void submit(primaryMode);
        }}
        className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start xl:gap-8"
      >
        <div className="flex flex-col gap-5 lg:gap-6">
          <Section title="Información básica">
            {organizers && !event && (
              <FormField id="organizerId" label="Organizador" error={errors.organizerId}>
                <Select
                  name="organizerId"
                  value={organizerId || null}
                  items={organizers.map((item) => ({ value: item.id, label: item.name }))}
                  onValueChange={(next) => {
                    setOrganizerId(next ?? "");
                    setErrors((previous) => ({ ...previous, organizerId: "" }));
                  }}
                >
                  <SelectTrigger
                    id="organizerId"
                    aria-required
                    aria-invalid={errors.organizerId ? true : undefined}
                    aria-describedby={errors.organizerId ? "organizerId-error" : undefined}
                    className={SELECT_CLASS}
                  >
                    <SelectValue placeholder="Elige a quién pertenece el evento" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizers.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}
            <FormField id="title" label="Nombre del evento" error={errors.title}>
              <Input
                {...fieldProps("title", reasonId("other"), isDisabled("title"))}
                placeholder="Ej. Festival de verano 2026"
                value={values.title}
                onChange={(e) => set("title", e.target.value)}
                className={FIELD_CLASS}
              />
            </FormField>
            <FormField id="categoryId" label="Categoría" error={errors.categoryId}>
              <Select
                {...selectProps("categoryId", reasonId("other"), isDisabled("categoryId")).root}
                value={values.categoryId || null}
                items={options.categories.map((item) => ({ value: item.id, label: item.label }))}
                onValueChange={(next) => set("categoryId", next ?? "")}
              >
                <SelectTrigger {...selectProps("categoryId", reasonId("other"), isDisabled("categoryId")).trigger} className={SELECT_CLASS}>
                  <SelectValue placeholder="Elige una categoría" />
                </SelectTrigger>
                <SelectContent>
                  {options.categories.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField id="description" label="Descripción" required={false}>
              <textarea
                id="description"
                name="description"
                rows={4}
                disabled={isDisabled("description")}
                aria-describedby={isDisabled("description") ? reasonId("other") : undefined}
                placeholder="Cuenta de qué trata el evento, quiénes se presentan y qué incluye la entrada."
                value={values.description}
                onChange={(e) => set("description", e.target.value)}
                className="min-h-28 rounded-[14px] border border-zinc-300 bg-background px-4 py-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-[15px]"
              />
            </FormField>
          </Section>

          <Section title="Fecha y lugar">
            {!fieldsLocked && hasSales && (
              <p id={SALES_LOCK_REASON_ID} className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <Lock className="size-4 shrink-0" aria-hidden="true" />
                Hay entradas vendidas o reservadas: la fecha, la hora y el recinto no se pueden cambiar.
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:gap-x-5 lg:gap-y-[18px]">
              <FormField id="date" label="Fecha (hora de Lima)" error={errors.date}>
                <DatePicker
                  {...fieldProps("date", reasonId("date"), isDisabled("startsAt"))}
                  value={values.date}
                  onChange={(day) => set("date", day)}
                  className={FIELD_CLASS}
                />
              </FormField>
              <FormField id="time" label="Hora de inicio" error={errors.time}>
                <Input
                  {...fieldProps("time", reasonId("time"), isDisabled("startsAt"))}
                  type="time"
                  value={values.time}
                  onChange={(e) => set("time", e.target.value)}
                  className={FIELD_CLASS}
                />
              </FormField>
              <FormField id="venueId" label="Recinto" error={errors.venueId} className="sm:col-span-2">
                <Select
                  {...selectProps("venueId", reasonId("venueId"), isDisabled("venueId")).root}
                  value={values.venueId || null}
                  items={options.venues.map((item) => ({ value: item.id, label: `${item.name} · ${item.city}` }))}
                  onValueChange={(next) => changeVenue(next ?? "")}
                >
                  <SelectTrigger {...selectProps("venueId", reasonId("venueId"), isDisabled("venueId")).trigger} className={SELECT_CLASS}>
                    <SelectValue placeholder="Elige un recinto" />
                  </SelectTrigger>
                  <SelectContent>
                    {options.venues.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name} · {item.city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>
          </Section>

          <Section title="Imagen de portada">
            <CoverImageInput
              id="coverImageUrl"
              value={values.coverImageUrl}
              onChange={(coverImageUrl) => set("coverImageUrl", coverImageUrl)}
              error={errors.coverImageUrl}
              disabled={fieldsLocked || (event !== undefined && !event.editable.coverImageUrl)}
              reasonId={fieldsLocked ? LOCKED_REASON_ID : undefined}
            />
          </Section>

          <Section title="Zonas y precios" description="Cada zona del recinto tiene su precio. Déjalo vacío si esa zona no se vende.">
            <TicketTypesEditor
              venueZones={venue?.zones ?? []}
              value={values.zones}
              errors={errors}
              occupied={occupied}
              disabled={fieldsLocked}
              onChange={(zones) => set("zones", zones)}
            />
            {errors.zones && (
              <p id="zones-error" role="alert" className="text-[13px] font-medium text-destructive">
                {errors.zones}
              </p>
            )}
          </Section>
        </div>

        <aside aria-label="Vista previa" className="flex flex-col gap-3 xl:sticky xl:top-6">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Vista previa</span>
          <div className="bg-muted">
            <EventCard event={previewEvent} preview />
          </div>
          <p className="text-[13px] text-muted-foreground">Así verán tu evento los compradores en el listado.</p>

          {submitError && (
            <p role="alert" className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {submitError}
            </p>
          )}

          {!fieldsLocked && (
            <div className="mt-2 flex flex-col gap-2.5">
              <div className={cn("grid gap-2.5", !isPublished && "grid-cols-2 xl:grid-cols-1")}>
                {isPublished ? (
                  <Button type="submit" disabled={busy} className="h-[52px] cursor-pointer rounded-[14px] text-[15px] font-semibold">
                    {busy ? "Guardando…" : "Guardar cambios"}
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void submit("draft")}
                      className="h-[52px] cursor-pointer rounded-[14px] border-[1.5px] border-zinc-300 text-[15px] font-semibold"
                    >
                      Guardar borrador
                    </Button>
                    <Button
                      type="button"
                      disabled={busy || !canPublish}
                      aria-describedby={canPublish ? undefined : PUBLISH_REASON_ID}
                      onClick={() => void submit("publish")}
                      className="h-[52px] cursor-pointer rounded-[14px] text-[15px] font-semibold"
                    >
                      Publicar evento
                    </Button>
                  </>
                )}
              </div>
              {!isPublished && !canPublish && (
                <p id={PUBLISH_REASON_ID} className="text-[13px] text-muted-foreground">
                  Solo un organizador aprobado puede publicar eventos. Mientras tanto puedes guardar borradores.
                </p>
              )}
            </div>
          )}
        </aside>
      </form>
    </div>
  );
}
