import { create } from "zustand";

interface OrganizerState {
  /** One-off message shown after saving an event ("Evento publicado"). In memory only. */
  notice: string | null;
  setNotice: (message: string) => void;
  clearNotice: () => void;
}

export const useOrganizerStore = create<OrganizerState>()((set) => ({
  notice: null,
  setNotice: (message) => set({ notice: message }),
  clearNotice: () => set({ notice: null }),
}));
