import { describe, expect, it } from "vitest";

import { MAX_TICKETS_PER_ZONE, reserveTicketsSchema } from "@/modules/booking/reservation.schema";

const ZONE_A = "11111111-1111-4111-8111-111111111111";
const ZONE_B = "22222222-2222-4222-8222-222222222222";
const ZONE_C = "33333333-3333-4333-8333-333333333333";

/** A valid v4 UUID per index. */
const seatId = (index: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12, "0")}`;
const seatIds = (count: number) => Array.from({ length: count }, (_, index) => seatId(index + 1));

const SEATS = [{ eventZoneId: ZONE_A, seatIds: [seatId(1), seatId(2)] }];
const GENERAL_ADMISSION = [{ eventZoneId: ZONE_B, quantity: 3 }];

const input = (overrides: Record<string, unknown> = {}) => ({
  slug: "rock-fest-2026",
  seats: SEATS,
  generalAdmission: GENERAL_ADMISSION,
  ...overrides,
});

const isValid = (overrides: Record<string, unknown>) => reserveTicketsSchema.safeParse(input(overrides)).success;

describe("reserveTicketsSchema", () => {
  it("caps every zone at 6 tickets", () => {
    expect(MAX_TICKETS_PER_ZONE).toBe(6);
  });

  it("accepts only seats, only GA and both", () => {
    expect(isValid({ generalAdmission: [] })).toBe(true);
    expect(isValid({ seats: [] })).toBe(true);
    expect(reserveTicketsSchema.parse(input())).toEqual(input());
  });

  it("accepts up to 6 per zone", () => {
    expect(isValid({ seats: [{ eventZoneId: ZONE_A, seatIds: seatIds(6) }], generalAdmission: [] })).toBe(true);
    expect(isValid({ seats: [], generalAdmission: [{ eventZoneId: ZONE_B, quantity: 6 }] })).toBe(true);
  });

  it("rejects an empty selection", () => {
    expect(isValid({ seats: [], generalAdmission: [] })).toBe(false);
    expect(isValid({ seats: [{ eventZoneId: ZONE_A, seatIds: [] }], generalAdmission: [] })).toBe(false);
  });

  it("rejects missing lists", () => {
    expect(reserveTicketsSchema.safeParse({ slug: "rock-fest-2026", seats: SEATS }).success).toBe(false);
    expect(reserveTicketsSchema.safeParse({ slug: "rock-fest-2026", generalAdmission: GENERAL_ADMISSION }).success).toBe(
      false,
    );
  });

  it("rejects more than 6 seats in a zone", () => {
    expect(isValid({ seats: [{ eventZoneId: ZONE_A, seatIds: seatIds(7) }] })).toBe(false);
  });

  it.each([0, -1, 1.5, 7])("rejects a GA quantity of %s", (quantity) => {
    expect(isValid({ generalAdmission: [{ eventZoneId: ZONE_B, quantity }] })).toBe(false);
  });

  it("rejects a repeated zone within a list and across both lists", () => {
    expect(
      isValid({
        seats: [
          { eventZoneId: ZONE_A, seatIds: [seatId(1)] },
          { eventZoneId: ZONE_A, seatIds: [seatId(2)] },
        ],
      }),
    ).toBe(false);
    expect(
      isValid({
        generalAdmission: [
          { eventZoneId: ZONE_B, quantity: 1 },
          { eventZoneId: ZONE_B, quantity: 2 },
        ],
      }),
    ).toBe(false);
    expect(isValid({ generalAdmission: [{ eventZoneId: ZONE_A, quantity: 1 }] })).toBe(false);
  });

  it("rejects a repeated seat, in the same zone or another", () => {
    expect(isValid({ seats: [{ eventZoneId: ZONE_A, seatIds: [seatId(1), seatId(1)] }] })).toBe(false);
    expect(
      isValid({
        seats: [
          { eventZoneId: ZONE_A, seatIds: [seatId(1)] },
          { eventZoneId: ZONE_C, seatIds: [seatId(1)] },
        ],
      }),
    ).toBe(false);
  });

  it("rejects ids that are not UUIDs", () => {
    expect(isValid({ seats: [{ eventZoneId: "zone-a", seatIds: [seatId(1)] }] })).toBe(false);
    expect(isValid({ seats: [{ eventZoneId: ZONE_A, seatIds: ["seat-1"] }] })).toBe(false);
    expect(isValid({ generalAdmission: [{ eventZoneId: "zone-b", quantity: 1 }] })).toBe(false);
  });

  it("rejects an empty slug", () => {
    expect(isValid({ slug: "" })).toBe(false);
  });

  it("drops unknown keys", () => {
    const result = reserveTicketsSchema.parse({
      ...input(),
      userId: "someone-else",
      seats: [{ ...SEATS[0], priceCents: 1 }],
      generalAdmission: [{ ...GENERAL_ADMISSION[0], priceCents: 1 }],
    });

    expect(result).toEqual(input());
  });
});
