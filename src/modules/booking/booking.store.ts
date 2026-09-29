import { create } from "zustand";

import type { Seat, Zone } from "@/modules/booking/booking.types";

export const MAX_TICKETS_PER_ZONE = 6;

interface BookingState {
  eventId: string | null;
  activeZoneId: string | null;
  /** Selected seats of each numbered zone, in selection order. */
  seats: Record<string, Seat[]>;
  /** Ticket count of each standing zone. */
  quantities: Record<string, number>;
  /** Starts a selection for `eventId`; keeps it if it's the same event. */
  init: (eventId: string, activeZoneId: string | null) => void;
  setActiveZone: (zoneId: string) => void;
  toggleSeat: (zone: Zone, seat: Seat) => void;
  removeSeat: (zoneId: string, seatId: string) => void;
  setQuantity: (zone: Zone, quantity: number) => void;
  reset: () => void;
}

const EMPTY_SELECTION = { activeZoneId: null, seats: {}, quantities: {} };

export const useBookingStore = create<BookingState>()((set, get) => ({
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

  reset: () => set({ eventId: null, ...EMPTY_SELECTION }),
}));

export interface OrderLine {
  zoneId: string;
  zoneName: string;
  quantity: number;
  amount: number;
  seats: Seat[];
}

/** Summary lines (one per zone with tickets), in the zones' order. */
export function getOrderLines(
  zones: Zone[],
  selection: Pick<BookingState, "seats" | "quantities">,
): OrderLine[] {
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
  return lines.reduce(
    (totals, line) => ({ count: totals.count + line.quantity, total: totals.total + line.amount }),
    { count: 0, total: 0 },
  );
}
