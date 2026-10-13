import { describe, expect, it } from "vitest";

import type { OrderItemSource } from "@/modules/booking/checkout.types";
import {
  ORDER_CODE_ALPHABET,
  calculateOrderAmounts,
  generateOrderCode,
  toBuyerDefaults,
  toOrderItems,
} from "@/modules/booking/checkout.utils";

const GA: OrderItemSource = { eventZoneId: "zone-ga", eventSeatId: null, quantity: 3, priceCents: 5000 };
const SEAT_A: OrderItemSource = { eventZoneId: "zone-vip", eventSeatId: "seat-a", quantity: 1, priceCents: 12000 };
const SEAT_B: OrderItemSource = { eventZoneId: "zone-vip", eventSeatId: "seat-b", quantity: 1, priceCents: 12000 };

describe("generateOrderCode", () => {
  it("is TK- plus 8 characters of the alphabet", () => {
    expect(generateOrderCode()).toMatch(new RegExp(`^TK-[${ORDER_CODE_ALPHABET}]{8}$`));
  });

  it("is deterministic with an injected randomInt", () => {
    let calls = 0;
    const code = generateOrderCode(() => calls++);
    expect(code).toBe("TK-01234567");
    expect(generateOrderCode(() => 31)).toBe("TK-ZZZZZZZZ");
  });

  it("asks for an index within the alphabet", () => {
    const maxes: number[] = [];
    generateOrderCode((max) => {
      maxes.push(max);
      return 0;
    });
    expect(maxes).toEqual(Array(8).fill(32));
  });

  it("has no ambiguous characters", () => {
    expect(ORDER_CODE_ALPHABET).toHaveLength(32);
    expect(new Set(ORDER_CODE_ALPHABET).size).toBe(32);
    expect(ORDER_CODE_ALPHABET).not.toMatch(/[ILOU]/);
  });
});

describe("toOrderItems", () => {
  it("makes one row per seat", () => {
    expect(toOrderItems("order-1", [SEAT_A, SEAT_B])).toEqual([
      { orderId: "order-1", eventZoneId: "zone-vip", eventSeatId: "seat-a", unitPriceCents: 12000 },
      { orderId: "order-1", eventZoneId: "zone-vip", eventSeatId: "seat-b", unitPriceCents: 12000 },
    ]);
  });

  it("expands a GA item into one row per ticket without a seat", () => {
    const rows = toOrderItems("order-1", [GA]);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toEqual({ orderId: "order-1", eventZoneId: "zone-ga", eventSeatId: null, unitPriceCents: 5000 });
    }
  });

  it("mixes GA and seats", () => {
    const rows = toOrderItems("order-1", [GA, SEAT_A]);
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => row.orderId === "order-1")).toBe(true);
    expect(rows.at(-1)).toMatchObject({ eventSeatId: "seat-a", unitPriceCents: 12000 });
  });

  it("returns no rows without items", () => {
    expect(toOrderItems("order-1", [])).toEqual([]);
  });
});

describe("calculateOrderAmounts", () => {
  it("charges the subtotal and takes the fee from it", () => {
    expect(calculateOrderAmounts([GA], 10)).toEqual({ subtotalCents: 15000, platformFeeCents: 1500, totalCents: 15000 });
  });

  it("adds GA and seats", () => {
    expect(calculateOrderAmounts([GA, SEAT_A, SEAT_B], 10)).toEqual({
      subtotalCents: 39000,
      platformFeeCents: 3900,
      totalCents: 39000,
    });
  });

  it("supports 0 % and 100 %", () => {
    expect(calculateOrderAmounts([GA], 0).platformFeeCents).toBe(0);
    expect(calculateOrderAmounts([GA], 100)).toEqual({ subtotalCents: 15000, platformFeeCents: 15000, totalCents: 15000 });
  });

  it("rounds a fractional percentage", () => {
    // 5997 * 7.5 % = 449.775
    const item: OrderItemSource = { eventZoneId: "z", eventSeatId: null, quantity: 1, priceCents: 5997 };
    expect(calculateOrderAmounts([item], 7.5)).toEqual({ subtotalCents: 5997, platformFeeCents: 450, totalCents: 5997 });
  });

  it("is zero without items or with free tickets", () => {
    expect(calculateOrderAmounts([], 10)).toEqual({ subtotalCents: 0, platformFeeCents: 0, totalCents: 0 });
    expect(calculateOrderAmounts([{ ...GA, priceCents: 0 }], 10).totalCents).toBe(0);
  });
});

describe("toBuyerDefaults", () => {
  it("prefills everything the user has", () => {
    expect(
      toBuyerDefaults({
        fullName: "Ana Pérez",
        email: "ana@mail.com",
        phone: "987654321",
        documentType: "ce",
        documentNumber: "A1234567",
      }),
    ).toEqual({
      fullName: "Ana Pérez",
      email: "ana@mail.com",
      documentType: "ce",
      documentNumber: "A1234567",
      phone: "987654321",
    });
  });

  it("falls back to empty strings and dni without phone and document", () => {
    expect(
      toBuyerDefaults({ fullName: "Ana Pérez", email: "ana@mail.com", phone: null, documentType: null, documentNumber: null }),
    ).toEqual({ fullName: "Ana Pérez", email: "ana@mail.com", documentType: "dni", documentNumber: "", phone: "" });
  });

  it("leaves the name empty when the user has none", () => {
    expect(
      toBuyerDefaults({ fullName: null, email: "ana@mail.com", phone: null, documentType: null, documentNumber: null }).fullName,
    ).toBe("");
  });
});
