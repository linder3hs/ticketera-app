import { beforeEach, describe, expect, it } from "vitest";

import {
  MAX_TICKETS_PER_ZONE,
  getOrderLines,
  getOrderTotals,
  migrateBookingState,
  useBookingStore,
} from "@/modules/booking/booking.store";
import type { Seat, Zone } from "@/modules/booking/booking.types";
import { MAX_TICKETS_PER_ZONE as SCHEMA_MAX_TICKETS_PER_ZONE } from "@/modules/booking/reservation.schema";

function seat(row: string, number: number, status: Seat["status"] = "available"): Seat {
  return { id: `stand-${row}${number}`, row, number, x: 0, y: 0, status };
}

const STAND: Zone = {
  id: "stand",
  name: "Tribuna",
  shortName: "Tribuna",
  price: 100,
  currency: "PEN",
  color: "#000",
  status: "available",
  kind: "seated",
  shape: { path: "M0 0 Z", labelX: 0, labelY: 0 },
  rows: [],
};

const FIELD: Zone = { ...STAND, id: "field", name: "Campo", kind: "general", rows: undefined };
const SOLD_OUT_FIELD: Zone = { ...FIELD, id: "vip", status: "sold-out" };

const store = () => useBookingStore.getState();

describe("booking.store", () => {
  beforeEach(() => {
    store().reset();
    store().init("evt-001", "field");
  });

  describe("init", () => {
    it("keeps the selection for the same event", () => {
      store().setQuantity(FIELD, 2);
      store().init("evt-001", "stand");
      expect(store().quantities.field).toBe(2);
      expect(store().activeZoneId).toBe("field");
    });

    it("resets the selection when the event changes", () => {
      store().setQuantity(FIELD, 2);
      store().toggleSeat(STAND, seat("A", 1));
      store().init("evt-002", "stand");
      expect(store()).toMatchObject({ eventId: "evt-002", activeZoneId: "stand", seats: {}, quantities: {} });
    });
  });

  describe("toggleSeat", () => {
    it("selects and deselects an available seat", () => {
      store().toggleSeat(STAND, seat("A", 1));
      expect(store().seats.stand.map((item) => item.id)).toEqual(["stand-A1"]);

      store().toggleSeat(STAND, seat("A", 1));
      expect(store().seats.stand).toEqual([]);
    });

    it("ignores occupied seats", () => {
      store().toggleSeat(STAND, seat("A", 1, "occupied"));
      expect(store().seats.stand).toBeUndefined();
    });

    it("stops at the maximum per zone but still allows deselecting", () => {
      for (let n = 1; n <= MAX_TICKETS_PER_ZONE + 2; n++) store().toggleSeat(STAND, seat("A", n));
      expect(store().seats.stand).toHaveLength(MAX_TICKETS_PER_ZONE);

      store().toggleSeat(STAND, seat("A", 1));
      expect(store().seats.stand).toHaveLength(MAX_TICKETS_PER_ZONE - 1);
    });

    it("removes a seat from the summary", () => {
      store().toggleSeat(STAND, seat("A", 1));
      store().toggleSeat(STAND, seat("A", 2));
      store().removeSeat("stand", "stand-A1");
      expect(store().seats.stand.map((item) => item.id)).toEqual(["stand-A2"]);
    });
  });

  describe("setQuantity", () => {
    it("clamps the quantity between 0 and the maximum", () => {
      store().setQuantity(FIELD, 3);
      expect(store().quantities.field).toBe(3);
      store().setQuantity(FIELD, -1);
      expect(store().quantities.field).toBe(0);
      store().setQuantity(FIELD, MAX_TICKETS_PER_ZONE + 5);
      expect(store().quantities.field).toBe(MAX_TICKETS_PER_ZONE);
    });

    it("ignores sold-out and numbered zones", () => {
      store().setQuantity(SOLD_OUT_FIELD, 2);
      store().setQuantity(STAND, 2);
      expect(store().quantities).toEqual({});
    });
  });

  describe("getOrderLines / getOrderTotals", () => {
    it("builds one line per zone with tickets, with count and total", () => {
      store().setQuantity(FIELD, 2);
      store().toggleSeat(STAND, seat("B", 7));
      store().toggleSeat(STAND, seat("A", 4));
      store().toggleSeat(STAND, seat("A", 3));

      const lines = getOrderLines([SOLD_OUT_FIELD, FIELD, STAND], store());
      expect(lines.map(({ zoneId, quantity, amount }) => ({ zoneId, quantity, amount }))).toEqual([
        { zoneId: "field", quantity: 2, amount: 200 },
        { zoneId: "stand", quantity: 3, amount: 300 },
      ]);
      expect(lines[1].seats.map((item) => item.id)).toEqual(["stand-B7", "stand-A4", "stand-A3"]);
      expect(getOrderTotals(lines)).toEqual({ count: 5, total: 500 });
    });

    it("is empty without tickets", () => {
      const lines = getOrderLines([FIELD, STAND], store());
      expect(lines).toEqual([]);
      expect(getOrderTotals(lines)).toEqual({ count: 0, total: 0 });
    });
  });

  describe("pruneSelection", () => {
    it("drops the given seats from any zone and keeps the rest", () => {
      const BOX: Zone = { ...STAND, id: "box", name: "Palco" };
      store().toggleSeat(STAND, seat("A", 1));
      store().toggleSeat(STAND, seat("A", 2));
      store().toggleSeat(BOX, { ...seat("C", 3), id: "box-C3" });
      store().setQuantity(FIELD, 2);

      store().pruneSelection({ seatIds: ["stand-A1", "box-C3"], zoneIds: [] });

      expect(store().seats.stand.map((item) => item.id)).toEqual(["stand-A2"]);
      expect(store().seats.box).toEqual([]);
      expect(store().quantities).toEqual({ field: 2 });
    });

    it("clears the quantity of the given zones, also one that is now sold out", () => {
      const PIT: Zone = { ...FIELD, id: "pit", name: "Pit" };
      store().setQuantity(FIELD, 2);
      store().setQuantity(PIT, 3);
      store().toggleSeat(STAND, seat("A", 1));

      // Refreshed as sold out: setQuantity can no longer change it, pruneSelection can.
      store().setQuantity({ ...FIELD, status: "sold-out" }, 0);
      expect(store().quantities.field).toBe(2);

      store().pruneSelection({ seatIds: [], zoneIds: ["field"] });

      expect(store().quantities).toEqual({ pit: 3 });
      expect(store().seats.stand.map((item) => item.id)).toEqual(["stand-A1"]);
    });
  });

  describe("reset", () => {
    it("forgets the event and the whole selection", () => {
      store().setQuantity(FIELD, 2);
      store().toggleSeat(STAND, seat("A", 1));

      store().reset();

      expect(store()).toMatchObject({ eventId: null, activeZoneId: null, seats: {}, quantities: {} });
    });
  });

  describe("migrateBookingState", () => {
    it("keeps the selection and drops the orders and the buyer data of a previous version", () => {
      const stored = {
        eventId: "evt-001",
        activeZoneId: "stand",
        seats: { stand: [seat("A", 1)] },
        quantities: { field: 2 },
        lastOrder: { id: "TK-12345", buyerName: "Ana Pérez", email: "ana@mail.com" },
        orders: [{ id: "TK-12345", buyerName: "Ana Pérez", email: "ana@mail.com" }],
      };

      const migrated = migrateBookingState(stored);

      expect(migrated).toEqual({
        eventId: "evt-001",
        activeZoneId: "stand",
        seats: { stand: [seat("A", 1)] },
        quantities: { field: 2 },
      });
      expect(migrated).not.toHaveProperty("lastOrder");
      expect(migrated).not.toHaveProperty("orders");
    });

    it("falls back to an empty selection for null or values that are not objects", () => {
      const empty = { eventId: null, activeZoneId: null, seats: {}, quantities: {} };
      expect(migrateBookingState(null)).toEqual(empty);
      expect(migrateBookingState(undefined)).toEqual(empty);
      expect(migrateBookingState("garbage")).toEqual(empty);
      expect(migrateBookingState(42)).toEqual(empty);
      expect(migrateBookingState({})).toEqual(empty);
    });
  });

  describe("MAX_TICKETS_PER_ZONE", () => {
    it("is the reservation schema's per-zone limit", () => {
      expect(MAX_TICKETS_PER_ZONE).toBe(SCHEMA_MAX_TICKETS_PER_ZONE);
    });
  });
});
