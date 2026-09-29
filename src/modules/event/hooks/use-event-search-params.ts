"use client";

import { useCallback, useMemo, useOptimistic, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { parseSearchParams, toSearchHref } from "@/modules/event/event-search";
import type { EventSearchFilters } from "@/modules/event/event.types";

/**
 * The search filters in the URL, and a setter that replaces them (no new
 * history entry per checkbox, no scroll jump). Controls show the new value
 * right away while the results load.
 */
export function useEventSearchParams() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const urlFilters = useMemo(() => {
    const raw: Record<string, string[]> = {};
    for (const key of new Set(searchParams.keys())) raw[key] = searchParams.getAll(key);
    return parseSearchParams(raw);
  }, [searchParams]);
  const [filters, setOptimisticFilters] = useOptimistic(urlFilters);

  const setFilters = useCallback(
    (next: EventSearchFilters) =>
      startTransition(() => {
        setOptimisticFilters(next);
        router.replace(toSearchHref(next), { scroll: false });
      }),
    [router, setOptimisticFilters],
  );

  return { filters, setFilters, isPending };
}
