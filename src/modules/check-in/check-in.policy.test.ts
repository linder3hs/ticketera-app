import { describe, expect, it } from "vitest";

import { CHECK_IN_EVENT_STATUSES, canCheckIn } from "@/modules/check-in/check-in.policy";
import type { EventStatus } from "@/modules/event/event-list.types";
import type { PolicyActor, PolicyEvent } from "@/modules/event/event-write.types";
import type { OrganizerStatus, Role } from "@/modules/user/user.types";

const OWN = "org-own";
const OTHER = "org-other";

const event = (status: EventStatus = "published"): PolicyEvent => ({
  organizerId: OWN,
  status,
  startsAt: new Date("2026-12-15T01:00:00Z"),
});

const organizer = (organizerStatus: OrganizerStatus, organizerId: string | null = OWN): PolicyActor => ({
  role: "organizer",
  organizerId,
  organizerStatus: organizerId === null ? null : organizerStatus,
  stripeOnboardingStatus: organizerId === null ? null : "complete",
});

const withRole = (role: Role): PolicyActor => ({
  role,
  organizerId: null,
  organizerStatus: null,
  stripeOnboardingStatus: null,
});

describe("canCheckIn", () => {
  it("lets the approved owner scan", () => {
    expect(canCheckIn(organizer("approved"), event())).toBe(true);
  });

  it("does not let another organizer scan", () => {
    expect(canCheckIn(organizer("approved", OTHER), event())).toBe(false);
  });

  it("does not let an organizer without a profile scan", () => {
    expect(canCheckIn(organizer("approved", null), event())).toBe(false);
  });

  it("does not let a pending or suspended owner scan", () => {
    expect(canCheckIn(organizer("pending"), event())).toBe(false);
    expect(canCheckIn(organizer("suspended"), event())).toBe(false);
  });

  it("lets admin and super_admin scan any event, without an organizer profile", () => {
    expect(canCheckIn(withRole("admin"), event())).toBe(true);
    expect(canCheckIn(withRole("super_admin"), event())).toBe(true);
  });

  it("does not let a customer scan, even holding the owner's organizer id", () => {
    expect(canCheckIn(withRole("customer"), event())).toBe(false);
    expect(canCheckIn({ ...organizer("approved"), role: "customer" }, event())).toBe(false);
  });

  it("opens the door only for published and finished events", () => {
    expect(canCheckIn(organizer("approved"), event("published"))).toBe(true);
    expect(canCheckIn(organizer("approved"), event("finished"))).toBe(true);
    expect(canCheckIn(organizer("approved"), event("draft"))).toBe(false);
    expect(canCheckIn(organizer("approved"), event("cancelled"))).toBe(false);
  });

  it("applies the status rule to admins too", () => {
    expect(canCheckIn(withRole("admin"), event("draft"))).toBe(false);
    expect(canCheckIn(withRole("super_admin"), event("cancelled"))).toBe(false);
  });

  it("exposes the allowed statuses", () => {
    expect([...CHECK_IN_EVENT_STATUSES].sort()).toEqual(["finished", "published"]);
  });
});
