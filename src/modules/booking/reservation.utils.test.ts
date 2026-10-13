import { describe, expect, it } from "vitest";

import type { OrderLine, Seat } from "@/modules/booking/booking.types";
import type { ReservationItemRow, TicketRequest } from "@/modules/booking/reservation.types";
import {
  RESERVATION_MESSAGES,
  RESERVATION_MINUTES,
  findUnavailable,
  isUnavailableError,
  toActiveReservation,
  toReservationItems,
  toReserveInput,
} from "@/modules/booking/reservation.utils";

const seat = (id: string, row = "A", number = 1): Seat => ({ id, row, number, x: 0, y: 0, status: "available" });

const line = (overrides: Partial<OrderLine> = {}): OrderLine => ({
  zoneId: "z1",
  zoneName: "Platea",
  quantity: 0,
  amount: 0,
  seats: [],
  ...overrides,
});

describe("constants", () => {
  it("holds for 10 minutes and has the four messages", () => {
    expect(RESERVATION_MINUTES).toBe(10);
    expect(Object.keys(RESERVATION_MESSAGES).sort()).toEqual(["eventUnavailable", "generic", "invalid", "unavailable"]);
  });
});

describe("isUnavailableError", () => {
  it("is true for a tripped guard: division by zero or CHECK, also when wrapped", () => {
    expect(isUnavailableError({ code: "22012" })).toBe(true);
    expect(isUnavailableError({ code: "23514" })).toBe(true);
    expect(isUnavailableError({ cause: { code: "22012" } })).toBe(true);
  });

  it("is false for any other error", () => {
    expect(isUnavailableError({ code: "40P01" })).toBe(false);
    expect(isUnavailableError({ code: "23505" })).toBe(false);
    expect(isUnavailableError(new Error("network"))).toBe(false);
    expect(isUnavailableError(undefined)).toBe(false);
  });
});

describe("toReserveInput", () => {
  it("sends lines with seats as seats and the rest as GA, keeping the order", () => {
    const lines = [
      line({ zoneId: "ga1", quantity: 2 }),
      line({ zoneId: "z1", quantity: 2, seats: [seat("s2"), seat("s1")] }),
      line({ zoneId: "ga2", quantity: 1 }),
      line({ zoneId: "z2", quantity: 1, seats: [seat("s9")] }),
    ];

    expect(toReserveInput("rock-fest", lines)).toEqual({
      slug: "rock-fest",
      seats: [
        { eventZoneId: "z1", seatIds: ["s2", "s1"] },
        { eventZoneId: "z2", seatIds: ["s9"] },
      ],
      generalAdmission: [
        { eventZoneId: "ga1", quantity: 2 },
        { eventZoneId: "ga2", quantity: 1 },
      ],
    });
  });

  it("maps no lines to empty lists", () => {
    expect(toReserveInput("rock-fest", [])).toEqual({ slug: "rock-fest", seats: [], generalAdmission: [] });
  });
});

describe("toReservationItems", () => {
  it("makes one item per seat with quantity 1 and one per GA zone with a null seat", () => {
    const request: TicketRequest = {
      seats: [{ eventZoneId: "z1", seatIds: ["s1", "s2"] }],
      generalAdmission: [{ eventZoneId: "ga1", quantity: 4 }],
    };

    expect(toReservationItems("r1", request)).toEqual([
      { reservationId: "r1", eventZoneId: "z1", eventSeatId: "s1", quantity: 1 },
      { reservationId: "r1", eventZoneId: "z1", eventSeatId: "s2", quantity: 1 },
      { reservationId: "r1", eventZoneId: "ga1", eventSeatId: null, quantity: 4 },
    ]);
  });

  it("makes nothing from an empty request", () => {
    expect(toReservationItems("r1", { seats: [], generalAdmission: [] })).toEqual([]);
  });
});

describe("findUnavailable", () => {
  const request: TicketRequest = {
    seats: [{ eventZoneId: "z1", seatIds: ["missing", "free", "other-zone", "taken"] }],
    generalAdmission: [
      { eventZoneId: "ga-missing", quantity: 1 },
      { eventZoneId: "ga-open", quantity: 1 },
      { eventZoneId: "ga-full", quantity: 1 },
      { eventZoneId: "ga-short", quantity: 4 },
      { eventZoneId: "ga-over", quantity: 1 },
    ],
  };

  it("lists seats missing, in another zone or not free, and GA zones missing or with no remaining, in request order", () => {
    const result = findUnavailable(
      request,
      [
        { id: "taken", eventZoneId: "z1", free: false },
        { id: "other-zone", eventZoneId: "z2", free: true },
        { id: "free", eventZoneId: "z1", free: true },
      ],
      [
        { id: "ga-over", remaining: -2 },
        { id: "ga-open", remaining: 10 },
        { id: "ga-full", remaining: 0 },
        { id: "ga-short", remaining: 2 },
      ],
    );

    expect(result).toEqual({
      seatIds: ["missing", "other-zone", "taken"],
      zoneIds: ["ga-missing", "ga-full", "ga-over"],
    });
  });

  it("keeps a GA zone open when it has some remaining, though less than asked", () => {
    const result = findUnavailable(
      { seats: [], generalAdmission: [{ eventZoneId: "ga1", quantity: 4 }] },
      [],
      [{ id: "ga1", remaining: 2 }],
    );

    expect(result.zoneIds).toEqual([]);
  });

  it("returns empty lists when everything is available", () => {
    const result = findUnavailable(
      { seats: [{ eventZoneId: "z1", seatIds: ["s1"] }], generalAdmission: [{ eventZoneId: "ga1", quantity: 2 }] },
      [{ id: "s1", eventZoneId: "z1", free: true }],
      [{ id: "ga1", remaining: 2 }],
    );

    expect(result).toEqual({ seatIds: [], zoneIds: [] });
  });
});

describe("toActiveReservation", () => {
  const RESERVATION = { id: "r1", expiresAt: new Date("2026-10-07T15:10:00Z") };

  const seatItem = (overrides: Partial<ReservationItemRow> = {}): ReservationItemRow => ({
    eventZoneId: "z1",
    zoneName: "Platea",
    priceCents: 1999,
    quantity: 1,
    eventSeatId: "s1",
    rowLabel: "A",
    seatNumber: 1,
    x: 10,
    y: 20,
    ...overrides,
  });

  const gaItem = (overrides: Partial<ReservationItemRow> = {}): ReservationItemRow => ({
    eventZoneId: "ga1",
    zoneName: "Campo",
    priceCents: 15000,
    quantity: 2,
    eventSeatId: null,
    rowLabel: null,
    seatNumber: null,
    x: null,
    y: null,
    ...overrides,
  });

  it("returns the id and expiresAt as ISO", () => {
    expect(toActiveReservation(RESERVATION, [])).toEqual({ id: "r1", expiresAt: "2026-10-07T15:10:00.000Z", lines: [] });
  });

  it("makes one line per zone in the order the items come, summing quantities", () => {
    const { lines } = toActiveReservation(RESERVATION, [
      gaItem(),
      seatItem({ eventSeatId: "s1" }),
      seatItem({ eventSeatId: "s2", seatNumber: 2 }),
      seatItem({ eventSeatId: "s3", seatNumber: 3 }),
    ]);

    expect(lines.map(({ zoneId, zoneName, quantity }) => ({ zoneId, zoneName, quantity }))).toEqual([
      { zoneId: "ga1", zoneName: "Campo", quantity: 2 },
      { zoneId: "z1", zoneName: "Platea", quantity: 3 },
    ]);
  });

  it("computes amount = quantity × priceCents / 100, cents included", () => {
    const { lines } = toActiveReservation(RESERVATION, [
      seatItem({ eventSeatId: "s1" }),
      seatItem({ eventSeatId: "s2", seatNumber: 2 }),
      seatItem({ eventSeatId: "s3", seatNumber: 3 }),
      gaItem(),
    ]);

    expect(lines[0].amount).toBe(59.97);
    expect(lines[1].amount).toBe(300);
  });

  it("sorts seats by row in natural order and by number, with null x/y as 0", () => {
    const { lines } = toActiveReservation(RESERVATION, [
      seatItem({ eventSeatId: "10-1", rowLabel: "10", seatNumber: 1 }),
      seatItem({ eventSeatId: "2-12", rowLabel: "2", seatNumber: 12, x: null, y: null }),
      seatItem({ eventSeatId: "2-3", rowLabel: "2", seatNumber: 3 }),
    ]);

    expect(lines[0].seats).toEqual([
      { id: "2-3", row: "2", number: 3, x: 10, y: 20, status: "available" },
      { id: "2-12", row: "2", number: 12, x: 0, y: 0, status: "available" },
      { id: "10-1", row: "10", number: 1, x: 10, y: 20, status: "available" },
    ]);
  });

  it("gives GA lines no seats", () => {
    const { lines } = toActiveReservation(RESERVATION, [gaItem({ quantity: 4 })]);

    expect(lines).toEqual([{ zoneId: "ga1", zoneName: "Campo", quantity: 4, amount: 600, seats: [] }]);
  });
});
