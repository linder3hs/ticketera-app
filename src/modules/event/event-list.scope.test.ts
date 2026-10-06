import { describe, expect, it } from "vitest";

import { resolveEventScope } from "@/modules/event/event-list.scope";

const ORGANIZER_ID = "11111111-1111-4111-8111-111111111111";

describe("resolveEventScope", () => {
  it("scopes organizers to themselves and ignores a requested organizer", () => {
    expect(resolveEventScope({ id: "u1", role: "organizer" }, ORGANIZER_ID)).toEqual({ kind: "own", userId: "u1" });
  });

  it("lets admins and the super admin see everything, optionally for one organizer", () => {
    expect(resolveEventScope({ id: "u2", role: "admin" })).toEqual({ kind: "all", organizerId: undefined });
    expect(resolveEventScope({ id: "u3", role: "super_admin" }, ORGANIZER_ID)).toEqual({ kind: "all", organizerId: ORGANIZER_ID });
  });

  it("gives customers no access", () => {
    expect(resolveEventScope({ id: "u4", role: "customer" })).toBeNull();
  });
});
