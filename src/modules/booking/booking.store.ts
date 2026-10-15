import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { OrderLine, Seat, Zone } from "@/modules/booking/booking.types";
import { MAX_TICKETS_PER_ZONE } from "@/modules/booking/reservation.schema";
import type { UnavailableTickets } from "@/modules/booking/reservation.types";

export type { OrderLine };
export { MAX_TICKETS_PER_ZONE };

interface BookingState {
  eventId: string | null;
  activeZoneId: string | null;
  /** Selected seats of each numbered zone, in selection order. */
  seats: Record<string, Seat[]>;
  /** Ticket count of each standing zone. */
  quantities: Record<string, number>;
  /** Starts a selection for `eventId`; keeps it if it's the same event. */
  init: (eventId: string, activeZoneId: string | null) => void;
  /** `null` goes back to the venue overview. */
  setActiveZone: (zoneId: string | null) => void;
  toggleSeat: (zone: Zone, seat: Seat) => void;
  removeSeat: (zoneId: string, seatId: string) => void;
  setQuantity: (zone: Zone, quantity: number) => void;
  /** Drops what a failed hold found unavailable: those seats, and the quantity of those standing zones. */
  pruneSelection: (unavailable: UnavailableTickets) => void;
  /** Forgets the event and the whole selection (e.g. once it was paid). */
  reset: () => void;
}

const EMPTY_SELECTION = { activeZoneId: null, seats: {}, quantities: {} };

/** What `persist` keeps in `localStorage`: the selection only, never orders or buyer data. */
type PersistedBooking = Pick<BookingState, "eventId" | "activeZoneId" | "seats" | "quantities">;

/**
 * Brings a stored state of any earlier version to the current one. Version 0 also persisted the paid
 * orders with the buyer's name and email: only the selection survives. Tolerates anything that isn't an object.
 */
export function migrateBookingState(persisted: unknown): PersistedBooking {
  const stored = typeof persisted === "object" && persisted !== null ? (persisted as Partial<PersistedBooking>) : {};
  return {
    eventId: stored.eventId ?? null,
    activeZoneId: stored.activeZoneId ?? null,
    seats: stored.seats ?? {},
    quantities: stored.quantities ?? {},
  };
}

export const useBookingStore = create<BookingState>()(
  persist(
    (set, get) => ({
      eventId: null,
      ...EMPTY_SELECTION,

      init: (eventId, activeZoneId) => {
        if (get().eventId !== eventId) set({ ...EMPTY_SELECTION, eventId, activeZoneId });
      },

      setActiveZone: (zoneId) => set({ activeZoneId: zoneId }),

      toggleSeat: (zone, seat) => {
        if (zone.status === "sold-out" || seat.status === "occupied") return;

        const selected = get().seats[zone.id] ?? [];
        const isSelected = selected.some((item) => item.id === seat.id);
        if (!isSelected && selected.length >= MAX_TICKETS_PER_ZONE) return;

        const next = isSelected ? selected.filter((item) => item.id !== seat.id) : [...selected, seat];
        set({ seats: { ...get().seats, [zone.id]: next } });
      },

      removeSeat: (zoneId, seatId) => {
        const selected = get().seats[zoneId] ?? [];
        set({ seats: { ...get().seats, [zoneId]: selected.filter((seat) => seat.id !== seatId) } });
      },

      setQuantity: (zone, quantity) => {
        if (zone.kind !== "general" || zone.status === "sold-out") return;

        const clamped = Math.min(Math.max(quantity, 0), MAX_TICKETS_PER_ZONE);
        set({ quantities: { ...get().quantities, [zone.id]: clamped } });
      },

      pruneSelection: ({ seatIds, zoneIds }) => {
        const unavailableSeats = new Set(seatIds);
        const seats = Object.fromEntries(
          Object.entries(get().seats).map(([zoneId, selected]) => [
            zoneId,
            selected.filter((seat) => !unavailableSeats.has(seat.id)),
          ]),
        );
        const quantities = { ...get().quantities };
        for (const zoneId of zoneIds) delete quantities[zoneId];
        set({ seats, quantities });
      },

      reset: () => set({ eventId: null, ...EMPTY_SELECTION }),
    }),
    {
      name: "ticketera-booking",
      storage: createJSONStorage(() => localStorage),
      // Loaded after mount (see usePersistHydration) to match the server render.
      skipHydration: true,
      version: 1,
      migrate: migrateBookingState,
      partialize: ({ eventId, activeZoneId, seats, quantities }): PersistedBooking => ({
        eventId,
        activeZoneId,
        seats,
        quantities,
      }),
    },
  ),
);

/** Summary lines (one per zone with tickets), in the zones' order. */
export function getOrderLines(zones: Zone[], selection: Pick<BookingState, "seats" | "quantities">): OrderLine[] {
  return zones.flatMap((zone) => {
    const seats = selection.seats[zone.id] ?? [];
    const quantity = zone.kind === "seated" ? seats.length : (selection.quantities[zone.id] ?? 0);
    if (quantity === 0) return [];

    return [
      {
        zoneId: zone.id,
        zoneName: zone.name,
        quantity,
        amount: quantity * zone.price,
        seats,
      },
    ];
  });
}

export function getOrderTotals(lines: OrderLine[]) {
  return lines.reduce((totals, line) => ({ count: totals.count + line.quantity, total: totals.total + line.amount }), {
    count: 0,
    total: 0,
  });
}
