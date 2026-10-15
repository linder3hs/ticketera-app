import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { CheckInScreen } from "@/modules/check-in/components/CheckInScreen";
import { getCheckInEvent, getCheckInStats } from "@/modules/check-in/services/check-in-service";
import { requireRole } from "@/modules/user/current-user";

export const metadata: Metadata = { title: "Check-in — Ticketera" };

export default async function CheckInPage({ params }: PageProps<"/organizer/events/[id]/check-in">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const event = await getCheckInEvent(await requireRole("organizer"), id);
  if (!event) notFound();

  return <CheckInScreen event={event} initialStats={await getCheckInStats(event.id)} />;
}
