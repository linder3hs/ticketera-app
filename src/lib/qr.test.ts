import { describe, expect, it } from "vitest";

import { QR_QUIET_ZONE, buildQrMatrix } from "@/lib/qr";

const CODE = "Xk3_aB9-QwErTyUiOpAsDf";
const OTHER_CODE = "Zz9_aB9-QwErTyUiOpAsDf";

/** Finder pattern: 7x7 with a dark ring, a light ring and a 3x3 dark center. */
function expectFinder(matrix: boolean[][], top: number, left: number) {
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 7; col++) {
      const isRing = row === 0 || row === 6 || col === 0 || col === 6;
      const isCenter = row >= 2 && row <= 4 && col >= 2 && col <= 4;
      expect(matrix[top + row][left + col], `module ${row},${col}`).toBe(isRing || isCenter);
    }
  }
}

describe("buildQrMatrix", () => {
  it("is square", () => {
    const matrix = buildQrMatrix(CODE);
    expect(matrix.length).toBeGreaterThan(0);
    expect(matrix.every((row) => row.length === matrix.length)).toBe(true);
  });

  it("is deterministic", () => {
    expect(buildQrMatrix(CODE)).toEqual(buildQrMatrix(CODE));
  });

  it("changes with a different text", () => {
    expect(buildQrMatrix(CODE)).not.toEqual(buildQrMatrix(OTHER_CODE));
  });

  it("has the finder pattern in the three corners", () => {
    const matrix = buildQrMatrix(CODE);
    const last = matrix.length - 7;
    expectFinder(matrix, 0, 0);
    expectFinder(matrix, 0, last);
    expectFinder(matrix, last, 0);
  });

  it("has no border and keeps the same size for 22-character ticket codes", () => {
    const size = buildQrMatrix(CODE).length;
    expect(buildQrMatrix(OTHER_CODE).length).toBe(size);
    // Version 2 (25 modules) fits 22 characters at level M; a border would add 2.
    expect(size).toBe(25);
  });
});

describe("QR_QUIET_ZONE", () => {
  it("is 4 modules", () => {
    expect(QR_QUIET_ZONE).toBe(4);
  });
});
