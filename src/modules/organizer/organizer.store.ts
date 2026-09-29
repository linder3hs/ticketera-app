import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { getCapacity, getLowestPrice } from "@/modules/organizer/create-event.schema";
import type { CreateEventInput, OrganizerEvent, OrganizerEventStatus } from "@/modules/organizer/organizer.types";

interface OrganizerState {
  /** Events created in this browser, newest first. */
  createdEvents: OrganizerEvent[];
  /** One-off message for the dashboard after saving ("Evento publicado"). */
  notice: string | null;
  saveEvent: (input: CreateEventInput, status: OrganizerEventStatus, id?: string) => OrganizerEvent;
  clearNotice: () => void;
}

export const useOrganizerStore = create<OrganizerState>()(
  persist(
    (set, get) => ({
      createdEvents: [],
      notice: null,

      saveEvent: (input, status, id = `org-${Date.now()}`) => {
        const event: OrganizerEvent = {
          id,
          title: input.name.trim(),
          category: input.category,
          imageUrl: input.imageUrl,
          date: input.date,
          venue: input.venue.trim(),
          city: input.city.trim(),
          sold: 0,
          capacity: getCapacity(input.ticketTypes),
          priceFrom: getLowestPrice(input.ticketTypes) ?? 0,
          currency: "PEN",
          status,
        };
        set({
          createdEvents: [event, ...get().createdEvents],
          notice: status === "published" ? `“${event.title}” se publicó.` : `Guardamos “${event.title}” como borrador.`,
        });
        return event;
      },

      clearNotice: () => set({ notice: null }),
    }),
    {
      name: "ticketera-organizer",
      storage: createJSONStorage(() => localStorage),
      // Loaded after mount (see usePersistHydration) to match the server render.
      skipHydration: true,
      partialize: ({ createdEvents }) => ({ createdEvents }),
    },
  ),
);
