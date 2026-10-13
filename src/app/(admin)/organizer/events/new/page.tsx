import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { canCreateEvent, canOrganizerPublish } from "@/modules/event/event.policy";
import { resolvePolicyActor } from "@/modules/event/services/event-list-service";
import { listEventFormOptions, listOrganizerOptions } from "@/modules/event/services/event-form-service";
import { EventForm } from "@/modules/organizer/components/EventForm";
import { requireRole } from "@/modules/user/current-user";

export const metadata: Metadata = { title: "Crear evento — Ticketera" };

export default async function CreateEventPage() {
  const actor = await resolvePolicyActor(await requireRole("organizer"));
  if (!canCreateEvent(actor)) redirect("/organizer");

  // Admins have no `organizer` row: they pick the organizer who will own the event.
  const [options, organizers] = await Promise.all([
    listEventFormOptions(),
    actor.role === "organizer" ? undefined : listOrganizerOptions(),
  ]);

  return <EventForm options={options} organizers={organizers} canPublish={canOrganizerPublish(actor)} />;
}
