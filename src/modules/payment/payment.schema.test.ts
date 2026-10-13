import { describe, expect, it } from "vitest";

import { platformFeePercentSchema } from "@/modules/payment/payment.schema";

describe("platformFeePercentSchema", () => {
  it.each([0, 10, 7.5, 100])("accepts %s", (value) => {
    expect(platformFeePercentSchema.parse(value)).toBe(value);
  });

  it.each([-1, 100.5, "10", Number.NaN, Infinity, null, undefined, {}, { percent: 10 }, [10]])("rejects %s", (value) => {
    expect(platformFeePercentSchema.safeParse(value).success).toBe(false);
  });
});
