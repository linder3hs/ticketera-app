import { describe, expect, it } from "vitest";
import { cn, escapeLike, fromIsoDay, slugify, toIsoDay } from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });
});

describe("escapeLike", () => {
  it("escapes LIKE wildcards and the escape character", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });

  it("leaves plain text untouched", () => {
    expect(escapeLike("ana perez")).toBe("ana perez");
  });
});

describe("slugify", () => {
  it("drops accents and punctuation", () => {
    expect(slugify("Clásico Peruano: Universitario vs. Alianza Lima")).toBe(
      "clasico-peruano-universitario-vs-alianza-lima",
    );
  });

  it("collapses separators and trims dashes", () => {
    expect(slugify("  --Ñandú & Co.!  ")).toBe("nandu-co");
  });

  it("returns an empty string when nothing is left", () => {
    expect(slugify("¡¡¡")).toBe("");
  });
});

describe("toIsoDay / fromIsoDay", () => {
  it("round-trips a local calendar day", () => {
    expect(toIsoDay(fromIsoDay("2026-03-09")!)).toBe("2026-03-09");
  });

  it("returns undefined for empty or malformed values", () => {
    expect(fromIsoDay("")).toBeUndefined();
    expect(fromIsoDay(null)).toBeUndefined();
    expect(fromIsoDay("09/03/2026")).toBeUndefined();
  });
});
