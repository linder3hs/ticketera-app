import { describe, expect, it } from "vitest";

import { getFirstFreeSeatId, getNextSeatId } from "@/modules/booking/seat-navigation";
import type { Seat, SeatRow } from "@/modules/booking/booking.types";

/** Rows from strings: "." free, "x" occupied; seat n sits at x = n * 10. */
function rows(...layout: string[]): SeatRow[] {
  return layout.map((line, r) => {
    const label = String.fromCharCode(65 + r);
    return {
      label,
      seats: [...line].map(
        (char, i): Seat => ({
          id: `${label}${i + 1}`,
          row: label,
          number: i + 1,
          x: i * 10,
          y: r * 10,
          status: char === "x" ? "occupied" : "available",
        }),
      ),
    };
  });
}

describe("seat-navigation", () => {
  it("finds the first free seat, front row first", () => {
    expect(getFirstFreeSeatId(rows("xxx", "x.."))).toBe("B2");
    expect(getFirstFreeSeatId(rows("xx"))).toBeNull();
  });

  it("moves left and right along the row, skipping occupied seats", () => {
    const map = rows(".x.x.");
    expect(getNextSeatId(map, "A1", "right")).toBe("A3");
    expect(getNextSeatId(map, "A5", "left")).toBe("A3");
  });

  it("stops at the row ends", () => {
    const map = rows("...");
    expect(getNextSeatId(map, "A3", "right")).toBeNull();
    expect(getNextSeatId(map, "A1", "left")).toBeNull();
  });

  it("moves up and down to the closest free seat of the nearest row with one", () => {
    const map = rows(".....", "xxxxx", "x...x");
    expect(getNextSeatId(map, "A1", "down")).toBe("C2");
    expect(getNextSeatId(map, "C4", "up")).toBe("A4");
    expect(getNextSeatId(map, "C3", "down")).toBeNull();
    expect(getNextSeatId(map, "A3", "up")).toBeNull();
  });

  it("returns null for an unknown seat", () => {
    expect(getNextSeatId(rows("..."), "Z9", "right")).toBeNull();
  });
});
