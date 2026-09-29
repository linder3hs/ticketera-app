"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * The `persist` API that zustand adds to a store created with `persist`. It's
 * missing on the server, where there's no localStorage.
 */
interface PersistApi {
  persist?: {
    hasHydrated: () => boolean;
    onFinishHydration: (listener: () => void) => () => void;
    rehydrate: () => Promise<void> | void;
  };
}

const noop = () => () => {};
const notHydrated = () => false;

/**
 * Loads a persisted store (created with `skipHydration: true`) from storage
 * after mount and reports when it's done. Until then the component renders
 * the same as on the server, so there's no hydration mismatch; it should also
 * avoid writing to the store, or it would overwrite what's saved.
 */
export function usePersistHydration(store: PersistApi): boolean {
  const persist = store.persist;
  const hydrated = useSyncExternalStore(
    persist?.onFinishHydration ?? noop,
    persist?.hasHydrated ?? notHydrated,
    notHydrated,
  );

  useEffect(() => {
    if (persist && !persist.hasHydrated()) void persist.rehydrate();
  }, [persist]);

  return hydrated;
}
