import type { Metadata } from "next";

import { getCategories } from "@/modules/event/services/event-service";
import { CreateEventForm } from "@/modules/organizer/components/CreateEventForm";
import { OrganizerShell } from "@/modules/organizer/components/OrganizerShell";

export const metadata: Metadata = { title: "Crear evento — Ticketera" };

export default async function CreateEventPage() {
  const categories = await getCategories();

  return (
    <OrganizerShell active="events">
      <CreateEventForm categories={categories.map((category) => category.label)} />
    </OrganizerShell>
  );
}
