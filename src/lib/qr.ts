import { encode } from "uqr";

/** Light modules around the code that the QR spec requires for reliable scanning. */
export const QR_QUIET_ZONE = 4;

/**
 * QR matrix for `text` (error correction M, no border; add `QR_QUIET_ZONE`
 * when drawing). `true` is a dark module. Square: `matrix.length` modules per side.
 */
export function buildQrMatrix(text: string): boolean[][] {
  return encode(text, { ecc: "M", border: 0 }).data;
}
