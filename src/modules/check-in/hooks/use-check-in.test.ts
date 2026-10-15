import { beforeEach, describe, expect, it, vi } from "vitest";

import { checkInTicketAction } from "@/modules/check-in/actions";
import type { CheckInInput } from "@/modules/check-in/check-in.schema";
import type { CheckInOutcome } from "@/modules/check-in/check-in.types";
import { checkInRequest } from "@/modules/check-in/hooks/use-check-in";

vi.mock("@/modules/check-in/actions", () => ({ checkInTicketAction: vi.fn() }));

const input: CheckInInput = { eventId: "0b0e3c0e-5d44-4a86-9f0e-6c3f3a8b1d11", code: "abc" };
const outcome: CheckInOutcome = {
  result: "ok",
  holderName: "Ana",
  checkedInAt: new Date("2026-10-14T20:00:00Z"),
  stats: { checkedIn: 1, sold: 10 },
};

beforeEach(() => vi.mocked(checkInTicketAction).mockReset());

describe("checkInRequest", () => {
  it("returns the outcome on success", async () => {
    vi.mocked(checkInTicketAction).mockResolvedValue({ ok: true, data: outcome });
    await expect(checkInRequest(input)).resolves.toEqual(outcome);
    expect(checkInTicketAction).toHaveBeenCalledWith(input);
  });

  it("throws the server's message on failure", async () => {
    vi.mocked(checkInTicketAction).mockResolvedValue({ ok: false, error: "Datos inválidos." });
    await expect(checkInRequest(input)).rejects.toThrow("Datos inválidos.");
  });
});
