import { describe, expect, it } from "vitest";

import { generateOrderCode } from "@/modules/booking/checkout.utils";
import { getMyOrderSchema, orderCodeSchema } from "@/modules/booking/order.schema";

describe("orderCodeSchema", () => {
  it("accepts the codes generateOrderCode makes", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(orderCodeSchema.safeParse(generateOrderCode()).success).toBe(true);
    }
  });

  it.each([
    ["empty", ""],
    ["another prefix", "XX-7H3KQ9XM"],
    ["no prefix", "7H3KQ9XM"],
    ["too short", "TK-7H3KQ9X"],
    ["too long", "TK-7H3KQ9XMA"],
    ["lowercase", "TK-7h3kq9xm"],
    ["characters out of the alphabet (I, L, O, U)", "TK-7H3KQ9IL"],
    ["a symbol", "TK-7H3KQ9X!"],
    ["a trailing newline", "TK-7H3KQ9XM\n"],
  ])("rejects %s", (_name, value) => {
    expect(orderCodeSchema.safeParse(value).success).toBe(false);
  });

  it("rejects values that are not strings", () => {
    expect(orderCodeSchema.safeParse(undefined).success).toBe(false);
    expect(orderCodeSchema.safeParse(12345678).success).toBe(false);
  });
});

describe("getMyOrderSchema", () => {
  it("reads the code and drops anything else", () => {
    const parsed = getMyOrderSchema.safeParse({ code: "TK-7H3KQ9XM", userId: "someone-else" });
    expect(parsed.success && parsed.data).toEqual({ code: "TK-7H3KQ9XM" });
  });

  it("rejects input without a valid code", () => {
    expect(getMyOrderSchema.safeParse({}).success).toBe(false);
    expect(getMyOrderSchema.safeParse({ code: "nope" }).success).toBe(false);
    expect(getMyOrderSchema.safeParse(null).success).toBe(false);
  });
});
