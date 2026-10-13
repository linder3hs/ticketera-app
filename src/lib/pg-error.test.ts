import { describe, expect, it } from "vitest";

import { pgErrorCode } from "@/lib/pg-error";

/** `code` wrapped in `levels` nested `cause`s. */
const nested = (code: string, levels: number): unknown =>
  Array.from({ length: levels }).reduce<unknown>((inner) => ({ cause: inner }), { code });

describe("pgErrorCode", () => {
  it("returns a top-level string code (NeonDbError shape)", () => {
    expect(pgErrorCode(Object.assign(new Error("division by zero"), { code: "22012" }))).toBe("22012");
  });

  it("returns the code of a nested cause (DrizzleQueryError shape)", () => {
    const driverError = Object.assign(new Error("check violation"), { code: "23514" });
    expect(pgErrorCode(new Error("Failed query", { cause: driverError }))).toBe("23514");
  });

  it("returns undefined for an Error without code, a non-string code and null", () => {
    expect(pgErrorCode(new Error("network"))).toBeUndefined();
    expect(pgErrorCode({ code: 23514 })).toBeUndefined();
    expect(pgErrorCode(null)).toBeUndefined();
    expect(pgErrorCode(undefined)).toBeUndefined();
  });

  it("looks at most 5 levels deep", () => {
    expect(pgErrorCode(nested("40P01", 4))).toBe("40P01");
    expect(pgErrorCode(nested("40P01", 5))).toBeUndefined();
  });
});
