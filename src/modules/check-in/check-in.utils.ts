import type { CheckInResult, MissResult, ScannedTicket } from "@/modules/check-in/check-in.types";

/** The scanned text as the server compares it: no whitespace anywhere; case, `-` and `_` untouched. */
export function normalizeScannedCode(raw: string): string {
  return raw.replace(/\s+/g, "");
}

/**
 * Why the atomic `ok` update touched no row, from the ticket looked up by its
 * code. Another event wins over the status, so a foreign ticket never reveals
 * whether it was used. `retry`: the ticket is `valid` here, its state changed
 * between the two statements.
 */
export function classifyMiss(found: Pick<ScannedTicket, "eventId" | "status"> | undefined, eventId: string): MissResult {
  if (!found) return "invalid";
  if (found.eventId !== eventId) return "wrong_event";
  switch (found.status) {
    case "used":
      return "already_used";
    case "valid":
      return "retry";
    default:
      return "invalid";
  }
}

/** Camera frames without a decoded QR after which the same code counts as a new presentation (about a second). */
export const REARM_EMPTY_FRAMES = 8;

/** Scanner memory: the last code it accepted and how many empty frames followed it. */
export interface ScanGate {
  lastCode: string | null;
  emptyFrames: number;
}

export const INITIAL_SCAN_GATE: ScanGate = { lastCode: null, emptyFrames: 0 };

/**
 * One camera frame (`decoded` is the normalized text, `null` when nothing was
 * decoded). Ignores the frame while a request is in flight and the same code
 * until the QR left the frame for `rearmAfter` frames; a different code is
 * accepted at once. Pure: the caller keeps the returned `gate`. A code still in
 * frame resets the empty-frame count.
 */
export function shouldIgnoreScan(
  gate: ScanGate,
  decoded: string | null,
  pending: boolean,
  rearmAfter: number = REARM_EMPTY_FRAMES,
): { ignore: boolean; gate: ScanGate } {
  if (decoded === null) {
    const emptyFrames = gate.emptyFrames + 1;
    return { ignore: true, gate: emptyFrames >= rearmAfter ? INITIAL_SCAN_GATE : { ...gate, emptyFrames } };
  }
  if (decoded === gate.lastCode) return { ignore: true, gate: { ...gate, emptyFrames: 0 } };
  if (pending) return { ignore: true, gate };
  return { ignore: false, gate: { lastCode: decoded, emptyFrames: 0 } };
}

/** What the screen shows per result (Spanish, no details about the ticket or the other event). */
export const CHECK_IN_MESSAGES: Record<CheckInResult, string> = {
  ok: "Entrada válida",
  already_used: "Entrada ya usada",
  wrong_event: "Entrada de otro evento",
  invalid: "Entrada no válida",
};
