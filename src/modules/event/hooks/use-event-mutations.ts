"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import {
  createEventAction,
  deleteEventAction,
  retryEventRefundsAction,
  setEventFeaturedAction,
  setEventStatusAction,
  updateEventAction,
} from "@/modules/event/actions";
import type { EventActionResult, EventFormValues } from "@/modules/event/event-write.types";

/** Prefix of every `eventsQueryKey(query)`: invalidating it refetches all cached event lists. */
export const eventsInvalidationKey = ["events"] as const;

type EventStatusChange = "published" | "draft" | "cancelled";

/** The action's data, or its error message thrown so React Query reports it as a failure. */
export function unwrap<T>(result: EventActionResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

/** `organizerId` is only read for admins, who create on behalf of an organizer. */
export const createEventMutation = async (values: EventFormValues & { organizerId?: string }) =>
  unwrap(await createEventAction(values));
export const updateEventMutation = async (variables: { id: string } & EventFormValues) =>
  unwrap(await updateEventAction(variables));
export const deleteEventMutation = async (variables: { id: string }) => unwrap(await deleteEventAction(variables));
export const setEventStatusMutation = async (variables: { id: string; status: EventStatusChange }) =>
  unwrap(await setEventStatusAction(variables));
export const retryEventRefundsMutation = async (variables: { id: string }) =>
  unwrap(await retryEventRefundsAction(variables));
export const setEventFeaturedMutation =async (variables: { id: string; featured: boolean }) =>
  unwrap(await setEventFeaturedAction(variables));

/** Runs `mutationFn`, then refreshes the cached lists and the server-rendered KPIs. */
function useEventMutation<TVariables, TData>(mutationFn: (variables: TVariables) => Promise<TData>) {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: eventsInvalidationKey });
      router.refresh();
    },
  });
}

export const useCreateEvent = () => useEventMutation(createEventMutation);
export const useUpdateEvent = () => useEventMutation(updateEventMutation);
export const useDeleteEvent = () => useEventMutation(deleteEventMutation);
export const useSetEventStatus = () => useEventMutation(setEventStatusMutation);
export const useRetryEventRefunds = () => useEventMutation(retryEventRefundsMutation);
export const useSetEventFeatured =() => useEventMutation(setEventFeaturedMutation);
