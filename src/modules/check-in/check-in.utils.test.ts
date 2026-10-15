import { describe, expect, it } from "vitest";

import type { CheckInResult, ScannedTicket } from "@/modules/check-in/check-in.types";
import {
  CHECK_IN_MESSAGES,
  INITIAL_SCAN_GATE,
  REARM_EMPTY_FRAMES,
  classifyMiss,
  normalizeScannedCode,
  shouldIgnoreScan,
  type ScanGate,
} from "@/modules/check-in/check-in.utils";

describe("normalizeScannedCode", () => {
  it("trims the ends", () => {
    expect(normalizeScannedCode("  abc  ")).toBe("abc");
  });

  it("removes inner spaces, tabs and line breaks", () => {
    expect(normalizeScannedCode("ab c\td\r\nef")).toBe("abcdef");
  });

  it("keeps case, dashes and underscores", () => {
    expect(normalizeScannedCode(" aB-c_D ")).toBe("aB-c_D");
  });

  it("returns an empty string for blank text", () => {
    expect(normalizeScannedCode(" \n\t ")).toBe("");
  });
});

describe("classifyMiss", () => {
  const GATE = "event-gate";
  const ticket = (overrides: Partial<Pick<ScannedTicket, "eventId" | "status">>) => ({
    eventId: GATE,
    status: "valid" as const,
    ...overrides,
  });

  it("is invalid when no ticket has the code", () => {
    expect(classifyMiss(undefined, GATE)).toBe("invalid");
  });

  it("is wrong_event for a ticket of another event", () => {
    expect(classifyMiss(ticket({ eventId: "other" }), GATE)).toBe("wrong_event");
  });

  it("is wrong_event before looking at the status, so it never reveals a used ticket", () => {
    expect(classifyMiss(ticket({ eventId: "other", status: "used" }), GATE)).toBe("wrong_event");
  });

  it("is already_used for a used ticket of this event", () => {
    expect(classifyMiss(ticket({ status: "used" }), GATE)).toBe("already_used");
  });

  it("is invalid for cancelled and refunded tickets", () => {
    expect(classifyMiss(ticket({ status: "cancelled" }), GATE)).toBe("invalid");
    expect(classifyMiss(ticket({ status: "refunded" }), GATE)).toBe("invalid");
  });

  it("is retry for a valid ticket of this event (its state changed between statements)", () => {
    expect(classifyMiss(ticket({ status: "valid" }), GATE)).toBe("retry");
  });
});

describe("shouldIgnoreScan", () => {
  const frames = (gate: ScanGate, count: number, decoded: string | null = null): ScanGate => {
    let current = gate;
    for (let i = 0; i < count; i += 1) current = shouldIgnoreScan(current, decoded, false).gate;
    return current;
  };

  it("accepts the first code and remembers it", () => {
    const step = shouldIgnoreScan(INITIAL_SCAN_GATE, "A", false);
    expect(step.ignore).toBe(false);
    expect(step.gate).toEqual({ lastCode: "A", emptyFrames: 0 });
  });

  it("ignores the same code while it stays in frame", () => {
    const { gate } = shouldIgnoreScan(INITIAL_SCAN_GATE, "A", false);
    const step = shouldIgnoreScan(gate, "A", false);
    expect(step.ignore).toBe(true);
    expect(step.gate.lastCode).toBe("A");
  });

  it("keeps ignoring the same code if empty frames come in fewer than the rearm count", () => {
    const { gate } = shouldIgnoreScan(INITIAL_SCAN_GATE, "A", false);
    const gap = frames(gate, REARM_EMPTY_FRAMES - 1);
    expect(shouldIgnoreScan(gap, "A", false).ignore).toBe(true);
  });

  it("accepts the same code again after the rearm count of empty frames", () => {
    const { gate } = shouldIgnoreScan(INITIAL_SCAN_GATE, "A", false);
    const gap = frames(gate, REARM_EMPTY_FRAMES);
    expect(shouldIgnoreScan(gap, "A", false).ignore).toBe(false);
  });

  it("restarts the empty-frame count when the code is seen again", () => {
    const { gate } = shouldIgnoreScan(INITIAL_SCAN_GATE, "A", false);
    const flicker = frames(gate, REARM_EMPTY_FRAMES - 1);
    const seen = shouldIgnoreScan(flicker, "A", false).gate;
    expect(seen.emptyFrames).toBe(0);
    expect(shouldIgnoreScan(frames(seen, REARM_EMPTY_FRAMES - 1), "A", false).ignore).toBe(true);
  });

  it("accepts a different code at once", () => {
    const { gate } = shouldIgnoreScan(INITIAL_SCAN_GATE, "A", false);
    const step = shouldIgnoreScan(gate, "B", false);
    expect(step.ignore).toBe(false);
    expect(step.gate.lastCode).toBe("B");
  });

  it("ignores everything while a request is in flight and does not remember the code", () => {
    const step = shouldIgnoreScan(INITIAL_SCAN_GATE, "A", true);
    expect(step.ignore).toBe(true);
    expect(step.gate).toEqual(INITIAL_SCAN_GATE);
    expect(shouldIgnoreScan(step.gate, "A", false).ignore).toBe(false);
  });

  it("ignores empty frames", () => {
    expect(shouldIgnoreScan(INITIAL_SCAN_GATE, null, false).ignore).toBe(true);
  });

  it("honours a custom rearm count", () => {
    const { gate } = shouldIgnoreScan(INITIAL_SCAN_GATE, "A", false);
    const gap = shouldIgnoreScan(gate, null, false, 1).gate;
    expect(shouldIgnoreScan(gap, "A", false, 1).ignore).toBe(false);
  });
});

describe("CHECK_IN_MESSAGES", () => {
  it("has a message for each of the four results", () => {
    const results: CheckInResult[] = ["ok", "already_used", "wrong_event", "invalid"];
    for (const result of results) expect(CHECK_IN_MESSAGES[result]).toBeTruthy();
    expect(Object.keys(CHECK_IN_MESSAGES).sort()).toEqual([...results].sort());
  });
});
