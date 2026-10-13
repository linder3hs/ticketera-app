import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface PanelState {
  collapsed: boolean;
  toggleCollapsed: () => void;
}

/** Desktop sidebar collapse (full ↔ icon rail). Saved in localStorage. */
export const usePanelStore = create<PanelState>()(
  persist(
    (set) => ({
      collapsed: false,
      toggleCollapsed: () => set((state) => ({ collapsed: !state.collapsed })),
    }),
    {
      name: "ticketera-panel",
      storage: createJSONStorage(() => localStorage),
      // Loaded after mount (see usePersistHydration) to match the server render.
      skipHydration: true,
      partialize: ({ collapsed }) => ({ collapsed }),
    },
  ),
);
