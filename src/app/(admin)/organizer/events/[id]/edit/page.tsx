import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { canActorPublish } from "@/modules/event/event.policy";
import { resolvePolicyActor } from "@/modules/event/services/event-list-service";
import { getEventForEdit, listEventFormOptions } from "@/modules/event/services/event-form-service";
import { EventForm } from "@/modules/organizer/components/EventForm";
import { requireRole } from "@/modules/user/current-user";

export const metadata: Metadata = { title: "Editar evento — Ticketera" };

export default async function EditEventPage({ params }: PageProps<"/organizer/events/[id]/edit">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const actor = await resolvePolicyActor(await requireRole("organizer"));
  const [options, event] = await Promise.all([listEventFormOptions(), getEventForEdit(actor, id)]);
  if (!event) notFound();

  // An approved organizer with payments set up, or the super admin, publishes (the admin moderates but does not publish).
  return <EventForm options={options} event={event} canPublish={canActorPublish(actor)} />;
}
