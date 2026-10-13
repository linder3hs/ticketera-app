"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { listEventsAction } from "@/modules/event/actions";
import type { EventListQuery, EventsPage } from "@/modules/event/event-list.types";

export const eventsQueryKey = (query: EventListQuery) => ["events", query] as const;

export async function fetchEvents(query: EventListQuery): Promise<EventsPage> {
  const result = await listEventsAction(query);
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

/** Events the current user may manage, with sales. Access is enforced by the server action; `query` only narrows it. */
export function useEvents(query: EventListQuery) {
  return useQuery({ queryKey: eventsQueryKey(query), queryFn: () => fetchEvents(query), placeholderData: keepPreviousData });
}
