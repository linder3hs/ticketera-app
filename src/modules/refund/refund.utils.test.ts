import { describe, expect, it } from "vitest";

import type { RefundActor, RefundEvent } from "@/modules/refund/refund.types";
import { canRetryEventRefunds, mapStripeRefundStatus, toRefundIdempotencyKey } from "@/modules/refund/refund.utils";

describe("toRefundIdempotencyKey", () => {
  it("is keyed by the refund row", () => {
    expect(toRefundIdempotencyKey("r-1")).toBe("refund-row:r-1");
  });
});

describe("mapStripeRefundStatus", () => {
  it.each([
    ["succeeded", "succeeded"],
    ["failed", "failed"],
    ["canceled", "canceled"],
  ] as const)("maps %s to %s", (stripe, expected) => {
    expect(mapStripeRefundStatus(stripe)).toBe(expected);
  });

  it.each(["pending", "requires_action", "something_new", ""])("changes nothing for %j", (stripe) => {
    expect(mapStripeRefundStatus(stripe)).toBeNull();
  });
});

describe("canRetryEventRefunds", () => {
  const organizer = (overrides: Partial<RefundActor> = {}): RefundActor => ({
    role: "organizer",
    organizerId: "org-1",
    organizerStatus: "approved",
    ...overrides,
  });
  const moderator = (role: "admin" | "super_admin"): RefundActor => ({ role, organizerId: null, organizerStatus: null });
  const customer: RefundActor = { role: "customer", organizerId: null, organizerStatus: null };
  const eventOf = (status: RefundEvent["status"]): RefundEvent => ({ organizerId: "org-1", status });

  it("allows a moderator on a cancelled event, whoever owns it", () => {
    expect(canRetryEventRefunds(moderator("admin"), eventOf("cancelled"))).toBe(true);
    expect(canRetryEventRefunds(moderator("super_admin"), eventOf("cancelled"))).toBe(true);
  });

  it("allows the owner with an approved organizer", () => {
    expect(canRetryEventRefunds(organizer(), eventOf("cancelled"))).toBe(true);
  });

  it.each(["pending", "suspended", null] as const)("denies an owner whose organizer is %s", (organizerStatus) => {
    expect(canRetryEventRefunds(organizer({ organizerStatus }), eventOf("cancelled"))).toBe(false);
  });

  it("denies an organizer of another event or without a profile", () => {
    expect(canRetryEventRefunds(organizer({ organizerId: "org-2" }), eventOf("cancelled"))).toBe(false);
    expect(canRetryEventRefunds(organizer({ organizerId: null }), eventOf("cancelled"))).toBe(false);
  });

  it("denies a customer", () => {
    expect(canRetryEventRefunds(customer, eventOf("cancelled"))).toBe(false);
  });

  it.each(["draft", "published", "finished"] as const)("denies everyone on a %s event", (status) => {
    expect(canRetryEventRefunds(organizer(), eventOf(status))).toBe(false);
    expect(canRetryEventRefunds(moderator("admin"), eventOf(status))).toBe(false);
  });
});
