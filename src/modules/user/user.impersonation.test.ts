import { describe, expect, it } from "vitest";

import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_MAX_AGE_SECONDS,
  parseImpersonationTargetId,
  resolveImpersonation,
} from "@/modules/user/user.impersonation";
import type { Role } from "@/modules/user/user.types";

const TARGET_ID = "0b0e4c1e-6c54-4f0e-9d0e-3a9f4b1c2d3e";

describe("impersonation cookie", () => {
  it("is named impersonate_user_id and lasts 8 hours", () => {
    expect(IMPERSONATION_COOKIE).toBe("impersonate_user_id");
    expect(IMPERSONATION_MAX_AGE_SECONDS).toBe(28800);
  });
});

describe("parseImpersonationTargetId", () => {
  it("returns null for a missing, empty or non-uuid value", () => {
    expect(parseImpersonationTargetId(undefined)).toBeNull();
    expect(parseImpersonationTargetId("")).toBeNull();
    expect(parseImpersonationTargetId("not-a-uuid")).toBeNull();
    expect(parseImpersonationTargetId(`${TARGET_ID}x`)).toBeNull();
  });

  it("returns the uuid when valid", () => {
    expect(parseImpersonationTargetId(TARGET_ID)).toBe(TARGET_ID);
  });
});

describe("resolveImpersonation", () => {
  const user = (id: string, role: Role, deletedAt: Date | null = null) => ({ id, role, deletedAt });
  const superAdmin = user("s", "super_admin");
  const organizer = user(TARGET_ID, "organizer");

  it("returns the real user and the target for a valid impersonation", () => {
    expect(resolveImpersonation(superAdmin, organizer)).toEqual({ real: superAdmin, target: organizer });
    const customer = user("c", "customer");
    expect(resolveImpersonation(superAdmin, customer)).toEqual({ real: superAdmin, target: customer });
  });

  it("ignores a forged cookie from anyone but the super admin", () => {
    for (const role of ["admin", "organizer", "customer"] as const) {
      expect(resolveImpersonation(user("x", role), organizer)).toBeNull();
    }
  });

  it("ignores a missing, admin, own or deleted target", () => {
    expect(resolveImpersonation(superAdmin, undefined)).toBeNull();
    expect(resolveImpersonation(superAdmin, user("a", "admin"))).toBeNull();
    expect(resolveImpersonation(superAdmin, superAdmin)).toBeNull();
    expect(resolveImpersonation(superAdmin, user(TARGET_ID, "organizer", new Date()))).toBeNull();
  });
});
