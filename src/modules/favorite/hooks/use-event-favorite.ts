"use client";

import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { setEventFavoriteAction } from "@/modules/favorite/actions";

interface SetFavoriteVariables {
  eventId: string;
  favorite: boolean;
}

/** Resolves on success; throws the action's error message so React Query reports a failure. */
export async function setFavoriteMutation(variables: SetFavoriteVariables): Promise<void> {
  const result = await setEventFavoriteAction({ eventId: variables.eventId, favorite: variables.favorite });
  if (!result.ok) throw new Error(result.error);
}

/** Optimistic favorite toggle: applies the desired value at once and rolls back if the action fails. */
export function useEventFavorite(eventId: string, initialSaved: boolean) {
  const [isSaved, setIsSaved] = useState(initialSaved);

  const mutation = useMutation({
    mutationFn: setFavoriteMutation,
    onMutate: (variables) => {
      const previous = isSaved;
      setIsSaved(variables.favorite);
      return { previous };
    },
    onError: (_error, _variables, context) => {
      setIsSaved(context?.previous ?? initialSaved);
    },
  });

  return {
    isSaved,
    isPending: mutation.isPending,
    toggle: () => mutation.mutate({ eventId, favorite: !isSaved }),
  };
}
