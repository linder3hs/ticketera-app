import { describe, expect, it } from "vitest";

import type { Role } from "@/modules/user/user.types";
import {
  VENUE_MESSAGES,
  canCreateVenue,
  canDeleteVenue,
  canEditVenue,
  canEditZones,
  checkZoneChange,
  getEditBlockedReason,
  getVenueCapabilities,
  getVenueOwner,
  getZoneCapabilities,
  getZonesBlockedReason,
} from "@/modules/venue/venue.policy";
import type { PolicyVenue, VenueActor, VenueFacts } from "@/modules/venue/venue.types";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const actor = (role: Role): VenueActor => ({ id: ME, role });

const OWN: PolicyVenue = { createdBy: ME };
const FOREIGN: PolicyVenue = { createdBy: OTHER };
const SEED: PolicyVenue = { createdBy: null };

const FREE: VenueFacts = { isReferenced: false, hasSales: false };
const REFERENCED: VenueFacts = { isReferenced: true, hasSales: false };
const SOLD: VenueFacts = { isReferenced: true, hasSales: true };

/** [who, venue, can edit]: the ownership matrix (AC1). */
const OWNERSHIP: [string, VenueActor, PolicyVenue, boolean][] = [
  ["customer / own", actor("customer"), OWN, false],
  ["customer / foreign", actor("customer"), FOREIGN, false],
  ["customer / seed", actor("customer"), SEED, false],
  ["organizer / own", actor("organizer"), OWN, true],
  ["organizer / foreign", actor("organizer"), FOREIGN, false],
  ["organizer / seed", actor("organizer"), SEED, false],
  ["admin / own", actor("admin"), OWN, true],
  ["admin / foreign", actor("admin"), FOREIGN, true],
  ["admin / seed", actor("admin"), SEED, true],
  ["super_admin / foreign", actor("super_admin"), FOREIGN, true],
  ["super_admin / seed", actor("super_admin"), SEED, true],
];

describe("canCreateVenue", () => {
  it.each([
    ["customer", false],
    ["organizer", true],
    ["admin", true],
    ["super_admin", true],
  ] as const)("%s -> %s", (role, expected) => {
    expect(canCreateVenue(actor(role))).toBe(expected);
  });
});

describe("canEditVenue", () => {
  it.each(OWNERSHIP)("%s -> %s", (_label, who, venue, expected) => {
    expect(canEditVenue(who, venue)).toBe(expected);
  });

  it("does not depend on sales or events", () => {
    // Basic data stays editable; the facts are not even an argument.
    expect(canEditVenue(actor("organizer"), OWN)).toBe(true);
  });
});

describe("canDeleteVenue", () => {
  it.each(OWNERSHIP)("not referenced: %s -> %s", (_label, who, venue, expected) => {
    expect(canDeleteVenue(who, venue, FREE)).toBe(expected);
  });

  it.each(OWNERSHIP)("referenced: %s -> false", (_label, who, venue) => {
    expect(canDeleteVenue(who, venue, REFERENCED)).toBe(false);
  });

  it("is blocked by events even without sales, and by sales", () => {
    expect(canDeleteVenue(actor("admin"), SEED, { isReferenced: true, hasSales: false })).toBe(false);
    expect(canDeleteVenue(actor("admin"), SEED, SOLD)).toBe(false);
  });
});

describe("canEditZones", () => {
  it.each(OWNERSHIP)("no sales: %s -> %s", (_label, who, venue, expected) => {
    expect(canEditZones(who, venue, FREE)).toBe(expected);
  });

  it("a venue used by an event without sales still allows zone edits", () => {
    expect(canEditZones(actor("organizer"), OWN, REFERENCED)).toBe(true);
  });

  it.each(OWNERSHIP)("with sales: %s -> false", (_label, who, venue) => {
    expect(canEditZones(who, venue, SOLD)).toBe(false);
    expect(canEditZones(who, venue, { isReferenced: false, hasSales: true })).toBe(false);
  });
});

describe("getVenueCapabilities", () => {
  it("gives everything to the owner of a free venue", () => {
    expect(getVenueCapabilities(actor("organizer"), OWN, FREE)).toEqual({ edit: true, delete: true, editZones: true });
  });

  it("keeps editing basic data but not zones or deletion once sold", () => {
    expect(getVenueCapabilities(actor("admin"), FOREIGN, SOLD)).toEqual({ edit: true, delete: false, editZones: false });
  });

  it("only blocks deletion while an event uses the venue", () => {
    expect(getVenueCapabilities(actor("organizer"), OWN, REFERENCED)).toEqual({ edit: true, delete: false, editZones: true });
  });

  it("gives nothing to who cannot edit", () => {
    const none = { edit: false, delete: false, editZones: false };
    expect(getVenueCapabilities(actor("customer"), OWN, FREE)).toEqual(none);
    expect(getVenueCapabilities(actor("organizer"), FOREIGN, FREE)).toEqual(none);
    expect(getVenueCapabilities(actor("organizer"), SEED, FREE)).toEqual(none);
  });
});

describe("getZoneCapabilities", () => {
  it("allows everything on a free zone", () => {
    expect(getZoneCapabilities({ isReferenced: false, minCapacity: 0 })).toEqual({
      delete: true,
      changeType: true,
      generateSeats: true,
      minCapacity: 0,
    });
  });

  it("locks delete, type and seats on a zone an event uses, and reports its minimum capacity", () => {
    expect(getZoneCapabilities({ isReferenced: true, minCapacity: 300 })).toEqual({
      delete: false,
      changeType: false,
      generateSeats: false,
      minCapacity: 300,
    });
  });
});

describe("checkZoneChange", () => {
  const ga = (capacity: number | null) => ({ seatingType: "general_admission", capacity }) as const;
  const numbered = { seatingType: "numbered", capacity: null } as const;
  const free = { isReferenced: false, minCapacity: 0 };
  const used = { isReferenced: true, minCapacity: 300 };

  it("allows any change on a free zone, including the type", () => {
    expect(checkZoneChange(ga(100), numbered, free)).toEqual([]);
    expect(checkZoneChange(numbered, ga(50), free)).toEqual([]);
    expect(checkZoneChange(ga(100), ga(10), free)).toEqual([]);
  });

  it("locks the type of a zone an event uses", () => {
    expect(checkZoneChange(ga(500), numbered, used)).toEqual(["type_locked"]);
    expect(checkZoneChange(numbered, ga(500), used)).toEqual(["type_locked"]);
  });

  it("rejects a capacity below what events use", () => {
    expect(checkZoneChange(ga(500), ga(299), used)).toEqual(["capacity_below_in_use"]);
    expect(checkZoneChange(ga(500), ga(null), used)).toEqual(["capacity_below_in_use"]);
  });

  it("allows a capacity equal to or above the minimum", () => {
    expect(checkZoneChange(ga(500), ga(300), used)).toEqual([]);
    expect(checkZoneChange(ga(500), ga(1000), used)).toEqual([]);
  });

  it("reports both errors when both apply", () => {
    // Numbered -> general admission with a low capacity on a used zone.
    expect(checkZoneChange(numbered, ga(10), used)).toEqual(["type_locked", "capacity_below_in_use"]);
  });

  it("leaves a numbered zone of a referenced venue alone when only renamed", () => {
    expect(checkZoneChange(numbered, numbered, used)).toEqual([]);
  });
});

describe("getVenueOwner", () => {
  it("tells own, platform and other without exposing who", () => {
    expect(getVenueOwner(actor("organizer"), OWN)).toBe("own");
    expect(getVenueOwner(actor("organizer"), SEED)).toBe("platform");
    expect(getVenueOwner(actor("organizer"), FOREIGN)).toBe("other");
    expect(getVenueOwner(actor("admin"), FOREIGN)).toBe("other");
  });
});

describe("blocked reasons", () => {
  it("explains why the viewer cannot edit", () => {
    expect(getEditBlockedReason(actor("organizer"), OWN)).toBeUndefined();
    expect(getEditBlockedReason(actor("organizer"), SEED)).toBe(VENUE_MESSAGES.platform_venue);
    expect(getEditBlockedReason(actor("organizer"), FOREIGN)).toBe(VENUE_MESSAGES.other_owner);
    expect(getEditBlockedReason(actor("customer"), OWN)).toBe(VENUE_MESSAGES.forbidden);
  });

  it("explains why zones are read-only: ownership first, then sales", () => {
    expect(getZonesBlockedReason(actor("organizer"), OWN, FREE)).toBeUndefined();
    expect(getZonesBlockedReason(actor("organizer"), OWN, SOLD)).toBe(VENUE_MESSAGES.has_sales);
    expect(getZonesBlockedReason(actor("organizer"), SEED, SOLD)).toBe(VENUE_MESSAGES.platform_venue);
  });
});
