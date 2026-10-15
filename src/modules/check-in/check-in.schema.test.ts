import { describe, expect, it } from "vitest";

import { MAX_SCANNED_CODE_LENGTH, checkInInputSchema } from "@/modules/check-in/check-in.schema";

const EVENT_ID = "0b0c1d2e-3f40-4a51-8b62-73849a5b6c7d";

describe("checkInInputSchema", () => {
  it("accepts an event id and a token", () => {
    const result = checkInInputSchema.safeParse({ eventId: EVENT_ID, code: "aB3-_xYz9QwErTyUiOp12A" });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ eventId: EVENT_ID, code: "aB3-_xYz9QwErTyUiOp12A" });
  });

  it("rejects an event id that is not a uuid", () => {
    expect(checkInInputSchema.safeParse({ eventId: "123", code: "abc" }).success).toBe(false);
  });

  it("rejects an empty code", () => {
    expect(checkInInputSchema.safeParse({ eventId: EVENT_ID, code: "" }).success).toBe(false);
  });

  it("rejects a code that is only whitespace", () => {
    expect(checkInInputSchema.safeParse({ eventId: EVENT_ID, code: " \n\t " }).success).toBe(false);
  });

  it("normalizes inner and outer whitespace", () => {
    const result = checkInInputSchema.safeParse({ eventId: EVENT_ID, code: "  ab cd\nef " });
    expect(result.data?.code).toBe("abcdef");
  });

  it("rejects a raw code longer than the limit", () => {
    const code = "a".repeat(MAX_SCANNED_CODE_LENGTH + 1);
    expect(checkInInputSchema.safeParse({ eventId: EVENT_ID, code }).success).toBe(false);
  });

  it("accepts a raw code of exactly the limit", () => {
    const code = "a".repeat(MAX_SCANNED_CODE_LENGTH);
    expect(checkInInputSchema.safeParse({ eventId: EVENT_ID, code }).success).toBe(true);
  });

  it("counts the raw length, so padding cannot hide an oversized code", () => {
    const code = `${" ".repeat(MAX_SCANNED_CODE_LENGTH)}a`;
    expect(checkInInputSchema.safeParse({ eventId: EVENT_ID, code }).success).toBe(false);
  });

  it("accepts text that does not look like a token (it will be answered as invalid)", () => {
    const result = checkInInputSchema.safeParse({ eventId: EVENT_ID, code: "https://example.com/?q=1" });
    expect(result.success).toBe(true);
  });
});
