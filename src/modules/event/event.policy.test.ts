import { describe, expect, it } from "vitest";

import {
  canCancelEvent,
  canCreateEvent,
  canDeleteEvent,
  canEditEvent,
  canFeatureEvent,
  canPublishEvent,
  canUnpublishEvent,
  canViewEvent,
  checkZoneChanges,
  editableFields,
  getEventCapabilities,
  getPublishBlockers,
  isEventReadOnly,
} from "@/modules/event/event.policy";
import type {
  EventFacts,
  PolicyActor,
  PolicyEvent,
  PublishZone,
  ZoneState,
} from "@/modules/event/event-write.types";
import type { OrganizerStatus } from "@/modules/user/user.types";

const NOW = new Date("2026-10-02T15:00:00Z");
const FUTURE = new Date("2026-12-15T01:00:00Z");
const PAST = new Date("2026-09-01T01:00:00Z");

const OWN = "org-own";
const OTHER = "org-other";

const organizer = (organizerStatus: OrganizerStatus, organizerId: string | null = OWN): PolicyActor => ({
  role: "organizer",
  organizerId,
  organizerStatus: organizerId === null ? null : organizerStatus,
});
const approved = organizer("approved");
const pending = organizer("pending");
const suspended = organizer("suspended");
const foreign = organizer("approved", OTHER);
const noProfile = organizer("approved", null);
const admin: PolicyActor = { role: "admin", organizerId: null, organizerStatus: null };
const superAdmin: PolicyActor = { role: "super_admin", organizerId: null, organizerStatus: null };
// A demoted organizer keeps a (suspended) row; being admin must still not make them an owner.
const adminWithStaleProfile: PolicyActor = { role: "admin", organizerId: OWN, organizerStatus: "suspended" };
const customer: PolicyActor = { role: "customer", organizerId: null, organizerStatus: null };

const event = (overrides: Partial<PolicyEvent> = {}): PolicyEvent => ({
  organizerId: OWN,
  status: "published",
  startsAt: FUTURE,
  ...overrides,
});

const NO_SALES: EventFacts = { hasSales: false, hasOrders: false };
const SALES: EventFacts = { hasSales: true, hasOrders: true };
const ORDERS_ONLY: EventFacts = { hasSales: false, hasOrders: true };

const GA: PublishZone = { seatingType: "general_admission", priceCents: 5000, capacity: 100 };
const NUMBERED: PublishZone = { seatingType: "numbered", priceCents: 9000, capacity: null };

describe("isEventReadOnly", () => {
  it.each([
    ["draft", FUTURE, false],
    ["published", FUTURE, false],
    ["cancelled", FUTURE, true],
    ["finished", FUTURE, true],
    ["published", PAST, true],
    ["draft", NOW, true],
  ] as const)("%s starting %s -> %s", (status, startsAt, expected) => {
    expect(isEventReadOnly(event({ status, startsAt }), NOW)).toBe(expected);
  });
});

describe("canCreateEvent", () => {
  it.each([
    ["approved organizer", approved, true],
    ["pending organizer", pending, true],
    ["suspended organizer", suspended, true],
    ["organizer without profile", noProfile, false],
    ["admin", admin, true],
    ["super_admin", superAdmin, true],
    ["admin with a stale organizer row", adminWithStaleProfile, true],
    ["customer", customer, false],
  ])("%s -> %s", (_label, actor, expected) => {
    expect(canCreateEvent(actor)).toBe(expected);
  });
});

describe("canViewEvent", () => {
  it.each([
    ["owner (any status)", suspended, true],
    ["another organizer", foreign, false],
    ["organizer without profile", noProfile, false],
    ["admin", admin, true],
    ["super_admin", superAdmin, true],
    ["customer", customer, false],
  ])("%s -> %s", (_label, actor, expected) => {
    expect(canViewEvent(actor, event({ status: "cancelled" }))).toBe(expected);
  });
});

describe("canEditEvent", () => {
  it.each([
    ["approved owner", approved, "published", true],
    ["approved owner", approved, "draft", true],
    ["pending owner", pending, "draft", true],
    ["pending owner", pending, "published", false],
    ["suspended owner", suspended, "draft", true],
    ["suspended owner", suspended, "published", false],
    ["another organizer", foreign, "draft", false],
    ["organizer without profile", noProfile, "draft", false],
    ["admin", admin, "published", true],
    ["admin", admin, "draft", true],
    ["super_admin", superAdmin, "published", true],
    ["admin with a stale organizer row", adminWithStaleProfile, "published", true],
    ["customer", customer, "draft", false],
  ] as const)("%s on a future %s event -> %s", (_label, actor, status, expected) => {
    expect(canEditEvent(actor, event({ status }), NOW)).toBe(expected);
  });

  it.each(["cancelled", "finished"] as const)("nobody edits a %s event", (status) => {
    for (const actor of [approved, admin, superAdmin]) {
      expect(canEditEvent(actor, event({ status }), NOW)).toBe(false);
    }
  });

  it("nobody edits an event that already started", () => {
    for (const actor of [approved, admin, superAdmin]) {
      expect(canEditEvent(actor, event({ startsAt: NOW }), NOW)).toBe(false);
      expect(canEditEvent(actor, event({ startsAt: PAST, status: "draft" }), NOW)).toBe(false);
    }
  });
});

describe("canPublishEvent", () => {
  const draft = event({ status: "draft" });

  it.each([
    ["approved owner", approved, true],
    ["pending owner", pending, false],
    ["suspended owner", suspended, false],
    ["another organizer", foreign, false],
    ["organizer without profile", noProfile, false],
    ["admin", admin, false],
    ["super_admin", superAdmin, false],
    ["admin with a stale organizer row", adminWithStaleProfile, false],
    ["customer", customer, false],
  ])("%s on a ready draft -> %s", (_label, actor, expected) => {
    expect(canPublishEvent(actor, draft, [GA], NOW)).toBe(expected);
  });

  it.each(["published", "cancelled", "finished"] as const)("a %s event cannot be published", (status) => {
    expect(canPublishEvent(approved, event({ status }), [GA], NOW)).toBe(false);
  });

  it("needs a future draft", () => {
    expect(canPublishEvent(approved, event({ status: "draft", startsAt: PAST }), [GA], NOW)).toBe(false);
  });

  it("needs zones that pass the publish blockers", () => {
    expect(canPublishEvent(approved, draft, [], NOW)).toBe(false);
    expect(canPublishEvent(approved, draft, [{ ...GA, priceCents: 0 }], NOW)).toBe(false);
    expect(canPublishEvent(approved, draft, [{ ...GA, capacity: null }], NOW)).toBe(false);
    expect(canPublishEvent(approved, draft, [GA, NUMBERED], NOW)).toBe(true);
  });
});

describe("canUnpublishEvent", () => {
  it.each([
    ["approved owner", approved, NO_SALES, true],
    ["approved owner", approved, SALES, false],
    ["approved owner (orders without sales)", approved, ORDERS_ONLY, true],
    ["pending owner", pending, NO_SALES, false],
    ["suspended owner", suspended, NO_SALES, false],
    ["another organizer", foreign, NO_SALES, false],
    ["admin", admin, NO_SALES, true],
    ["admin", admin, SALES, true],
    ["super_admin", superAdmin, SALES, true],
    ["customer", customer, NO_SALES, false],
  ])("%s with %j -> %s", (_label, actor, facts, expected) => {
    expect(canUnpublishEvent(actor, event({ status: "published" }), facts, NOW)).toBe(expected);
  });

  it.each(["draft", "cancelled", "finished"] as const)("a %s event cannot be unpublished", (status) => {
    expect(canUnpublishEvent(admin, event({ status }), NO_SALES, NOW)).toBe(false);
  });

  it("a started event cannot be unpublished", () => {
    expect(canUnpublishEvent(admin, event({ startsAt: PAST }), NO_SALES, NOW)).toBe(false);
  });
});

describe("canCancelEvent", () => {
  it.each([
    ["approved owner", approved, true],
    ["pending owner", pending, false],
    ["suspended owner", suspended, false],
    ["another organizer", foreign, false],
    ["organizer without profile", noProfile, false],
    ["admin", admin, true],
    ["super_admin", superAdmin, true],
    ["customer", customer, false],
  ])("%s on a published event -> %s", (_label, actor, expected) => {
    expect(canCancelEvent(actor, event({ status: "published" }), SALES, NOW)).toBe(expected);
  });

  it("cancels a draft only when it has orders", () => {
    expect(canCancelEvent(approved, event({ status: "draft" }), NO_SALES, NOW)).toBe(false);
    expect(canCancelEvent(approved, event({ status: "draft" }), ORDERS_ONLY, NOW)).toBe(true);
    expect(canCancelEvent(admin, event({ status: "draft" }), NO_SALES, NOW)).toBe(false);
    expect(canCancelEvent(admin, event({ status: "draft" }), ORDERS_ONLY, NOW)).toBe(true);
  });

  it.each(["cancelled", "finished"] as const)("a %s event cannot be cancelled", (status) => {
    expect(canCancelEvent(admin, event({ status }), SALES, NOW)).toBe(false);
  });

  it("a started event cannot be cancelled", () => {
    expect(canCancelEvent(admin, event({ startsAt: PAST }), SALES, NOW)).toBe(false);
    expect(canCancelEvent(approved, event({ startsAt: NOW }), SALES, NOW)).toBe(false);
  });
});

describe("canDeleteEvent", () => {
  it.each([
    ["approved owner, published", approved, "published", true],
    ["approved owner, draft", approved, "draft", true],
    ["pending owner, draft", pending, "draft", true],
    ["pending owner, published", pending, "published", false],
    ["suspended owner, draft", suspended, "draft", true],
    ["suspended owner, published", suspended, "published", false],
    ["another organizer", foreign, "draft", false],
    ["organizer without profile", noProfile, "draft", false],
    ["admin", admin, "published", true],
    ["super_admin", superAdmin, "draft", true],
    ["customer", customer, "draft", false],
  ] as const)("%s without orders -> %s", (_label, actor, status, expected) => {
    expect(canDeleteEvent(actor, event({ status }), NO_SALES)).toBe(expected);
  });

  it("never deletes an event with orders or reservations", () => {
    for (const actor of [approved, admin, superAdmin]) {
      expect(canDeleteEvent(actor, event({ status: "draft" }), ORDERS_ONLY)).toBe(false);
      expect(canDeleteEvent(actor, event({ status: "cancelled" }), SALES)).toBe(false);
    }
  });

  it("deletes a cancelled or past event without orders", () => {
    expect(canDeleteEvent(approved, event({ status: "cancelled" }), NO_SALES)).toBe(true);
    expect(canDeleteEvent(admin, event({ status: "published", startsAt: PAST }), NO_SALES)).toBe(true);
  });
});

describe("canFeatureEvent", () => {
  describe.each([
    ["customer", customer, false],
    ["owner organizer", approved, false],
    ["another organizer", foreign, false],
    ["admin", admin, true],
    ["super_admin", superAdmin, true],
    ["admin with a stale organizer row", adminWithStaleProfile, true],
  ])("%s", (_label, actor, moderator) => {
    it.each([
      ["draft", moderator],
      ["published", moderator],
      ["cancelled", false],
      ["finished", false],
    ] as const)("on a future %s event -> %s", (status, expected) => {
      expect(canFeatureEvent(actor, event({ status }), NOW)).toBe(expected);
    });

    it.each(["draft", "published"] as const)("never on a %s event that already started", (status) => {
      expect(canFeatureEvent(actor, event({ status, startsAt: PAST }), NOW)).toBe(false);
      expect(canFeatureEvent(actor, event({ status, startsAt: NOW }), NOW)).toBe(false);
    });
  });

  it("decides against the injected now", () => {
    const startsAt = new Date("2026-10-02T16:00:00Z");
    expect(canFeatureEvent(admin, event({ startsAt }), NOW)).toBe(true);
    expect(canFeatureEvent(admin, event({ startsAt }), startsAt)).toBe(false);
    expect(canFeatureEvent(admin, event({ startsAt }), new Date("2026-10-03T00:00:00Z"))).toBe(false);
  });
});

describe("editableFields", () => {
  const ALL = { title: true, description: true, coverImageUrl: true, categoryId: true, startsAt: true, venueId: true };

  it("is all open without sales", () => {
    expect(editableFields(event(), NO_SALES, NOW)).toEqual(ALL);
    expect(editableFields(event({ status: "draft" }), ORDERS_ONLY, NOW)).toEqual(ALL);
  });

  it("locks date and venue with sales", () => {
    expect(editableFields(event(), SALES, NOW)).toEqual({ ...ALL, startsAt: false, venueId: false });
  });

  it.each([
    event({ status: "cancelled" }),
    event({ status: "finished" }),
    event({ startsAt: PAST }),
  ])("is all closed when the event is read-only (%j)", (readOnly) => {
    const closed = Object.fromEntries(Object.keys(ALL).map((key) => [key, false]));
    expect(editableFields(readOnly, NO_SALES, NOW)).toEqual(closed);
    expect(editableFields(readOnly, SALES, NOW)).toEqual(closed);
  });
});

describe("getEventCapabilities", () => {
  it("combines every decision for an approved owner", () => {
    expect(getEventCapabilities(approved, event({ status: "draft" }), NO_SALES, [GA], NOW)).toEqual({
      edit: true,
      publish: true,
      unpublish: false,
      cancel: false,
      delete: true,
      feature: false,
    });
    expect(getEventCapabilities(approved, event({ status: "published" }), SALES, [GA], NOW)).toEqual({
      edit: true,
      publish: false,
      unpublish: false,
      cancel: true,
      delete: false,
      feature: false,
    });
  });

  it("gives a customer nothing", () => {
    expect(getEventCapabilities(customer, event(), NO_SALES, [GA], NOW)).toEqual({
      edit: false,
      publish: false,
      unpublish: false,
      cancel: false,
      delete: false,
      feature: false,
    });
  });

  it("lets an admin moderate and feature but not publish", () => {
    expect(getEventCapabilities(admin, event({ status: "published" }), SALES, [GA], NOW)).toEqual({
      edit: true,
      publish: false,
      unpublish: true,
      cancel: true,
      delete: false,
      feature: true,
    });
  });
});

describe("checkZoneChanges", () => {
  const ga = (overrides: Partial<ZoneState> = {}): ZoneState => ({
    venueZoneId: "zone-ga",
    seatingType: "general_admission",
    priceCents: 5000,
    capacity: 100,
    occupied: 40,
    ...overrides,
  });
  const numbered = (overrides: Partial<ZoneState> = {}): ZoneState => ({
    venueZoneId: "zone-seats",
    seatingType: "numbered",
    priceCents: 9000,
    capacity: null,
    occupied: 3,
    ...overrides,
  });

  it("accepts keeping an occupied zone as it is", () => {
    expect(
      checkZoneChanges([ga(), numbered()], [
        { venueZoneId: "zone-ga", priceCents: 5000, capacity: 100 },
        { venueZoneId: "zone-seats", priceCents: 9000, capacity: null },
      ]),
    ).toEqual([]);
  });

  it("allows raising the capacity down to exactly the occupancy", () => {
    expect(checkZoneChanges([ga()], [{ venueZoneId: "zone-ga", priceCents: 5000, capacity: 500 }])).toEqual([]);
    expect(checkZoneChanges([ga()], [{ venueZoneId: "zone-ga", priceCents: 5000, capacity: 40 }])).toEqual([]);
  });

  it("locks the price of an occupied zone", () => {
    expect(checkZoneChanges([ga()], [{ venueZoneId: "zone-ga", priceCents: 6000, capacity: 100 }])).toEqual([
      { venueZoneId: "zone-ga", code: "price_locked" },
    ]);
    expect(checkZoneChanges([numbered()], [{ venueZoneId: "zone-seats", priceCents: 1, capacity: null }])).toEqual([
      { venueZoneId: "zone-seats", code: "price_locked" },
    ]);
  });

  it("does not let an occupied zone be removed", () => {
    expect(checkZoneChanges([ga(), numbered()], [{ venueZoneId: "zone-seats", priceCents: 9000, capacity: null }])).toEqual([
      { venueZoneId: "zone-ga", code: "zone_in_use" },
    ]);
    expect(checkZoneChanges([ga()], [])).toEqual([{ venueZoneId: "zone-ga", code: "zone_in_use" }]);
  });

  it("does not let GA capacity drop below the occupancy", () => {
    expect(checkZoneChanges([ga()], [{ venueZoneId: "zone-ga", priceCents: 5000, capacity: 39 }])).toEqual([
      { venueZoneId: "zone-ga", code: "capacity_below_occupied" },
    ]);
    expect(checkZoneChanges([ga()], [{ venueZoneId: "zone-ga", priceCents: 5000, capacity: null }])).toEqual([
      { venueZoneId: "zone-ga", code: "capacity_below_occupied" },
    ]);
  });

  it("ignores the capacity of a numbered zone", () => {
    expect(checkZoneChanges([numbered()], [{ venueZoneId: "zone-seats", priceCents: 9000, capacity: 1 }])).toEqual([]);
  });

  it("reports price and capacity together, per zone", () => {
    expect(checkZoneChanges([ga()], [{ venueZoneId: "zone-ga", priceCents: 1, capacity: 10 }])).toEqual([
      { venueZoneId: "zone-ga", code: "price_locked" },
      { venueZoneId: "zone-ga", code: "capacity_below_occupied" },
    ]);
  });

  it("leaves free zones alone and allows new ones", () => {
    expect(
      checkZoneChanges([ga({ occupied: 0 }), numbered({ occupied: 0 })], [
        { venueZoneId: "zone-ga", priceCents: 1, capacity: 1 },
        { venueZoneId: "zone-new", priceCents: 100, capacity: 10 },
      ]),
    ).toEqual([]);
  });
});

describe("getPublishBlockers", () => {
  const snapshot = (overrides: Partial<{ startsAt: Date; zones: PublishZone[] }> = {}) => ({
    startsAt: FUTURE,
    zones: [GA],
    ...overrides,
  });

  it("is empty when ready", () => {
    expect(getPublishBlockers(snapshot(), NOW)).toEqual([]);
    expect(getPublishBlockers(snapshot({ zones: [GA, NUMBERED] }), NOW)).toEqual([]);
  });

  it("asks for at least one zone", () => {
    expect(getPublishBlockers(snapshot({ zones: [] }), NOW)).toEqual(["no_zones"]);
  });

  it("asks every zone for a price above 0", () => {
    expect(getPublishBlockers(snapshot({ zones: [GA, { ...NUMBERED, priceCents: 0 }] }), NOW)).toEqual(["zone_without_price"]);
  });

  it("asks GA zones, but not numbered ones, for a capacity above 0", () => {
    expect(getPublishBlockers(snapshot({ zones: [{ ...GA, capacity: null }] }), NOW)).toEqual(["zone_without_capacity"]);
    expect(getPublishBlockers(snapshot({ zones: [{ ...GA, capacity: 0 }] }), NOW)).toEqual(["zone_without_capacity"]);
    expect(getPublishBlockers(snapshot({ zones: [NUMBERED] }), NOW)).toEqual([]);
  });

  it("asks for a future date (starting now is not future)", () => {
    expect(getPublishBlockers(snapshot({ startsAt: PAST }), NOW)).toEqual(["starts_in_past"]);
    expect(getPublishBlockers(snapshot({ startsAt: NOW }), NOW)).toEqual(["starts_in_past"]);
  });

  it("lists every reason", () => {
    expect(getPublishBlockers({ startsAt: PAST, zones: [] }, NOW)).toEqual(["no_zones", "starts_in_past"]);
  });
});
