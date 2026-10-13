import { describe, expect, it } from "vitest";

import { can, canAssignRole, canManageUser, hasRole } from "@/modules/user/user.permissions";

describe("hasRole", () => {
  it("follows the hierarchy super_admin > admin > organizer > customer", () => {
    expect(hasRole("super_admin", "admin")).toBe(true);
    expect(hasRole("admin", "organizer")).toBe(true);
    expect(hasRole("organizer", "admin")).toBe(false);
    expect(hasRole("customer", "customer")).toBe(true);
  });
});

describe("can", () => {
  it("restricts platform settings and admin management to super_admin", () => {
    expect(can("super_admin", "platform:settings")).toBe(true);
    expect(can("admin", "platform:settings")).toBe(false);
    expect(can("admin", "user:manage-admins")).toBe(false);
  });

  it("lets organizers manage their events but not moderate", () => {
    expect(can("organizer", "event:manage-own")).toBe(true);
    expect(can("organizer", "event:moderate")).toBe(false);
  });
});

describe("venue permissions", () => {
  it("lets organizers and above manage their own venues, not customers", () => {
    expect(can("organizer", "venue:manage-own")).toBe(true);
    expect(can("admin", "venue:manage-own")).toBe(true);
    expect(can("customer", "venue:manage-own")).toBe(false);
  });

  it("reserves venue moderation for admins and above", () => {
    expect(can("admin", "venue:moderate")).toBe(true);
    expect(can("super_admin", "venue:moderate")).toBe(true);
    expect(can("organizer", "venue:moderate")).toBe(false);
    expect(can("customer", "venue:moderate")).toBe(false);
  });
});

describe("canAssignRole", () => {
  it("lets the super admin create admins and organizers", () => {
    expect(canAssignRole("super_admin", "customer", "admin")).toBe(true);
    expect(canAssignRole("super_admin", "customer", "organizer")).toBe(true);
    expect(canAssignRole("super_admin", "admin", "customer")).toBe(true);
  });

  it("lets admins manage organizers only", () => {
    expect(canAssignRole("admin", "customer", "organizer")).toBe(true);
    expect(canAssignRole("admin", "customer", "admin")).toBe(false);
    expect(canAssignRole("admin", "admin", "customer")).toBe(false);
  });

  it("never assigns or removes super_admin", () => {
    expect(canAssignRole("super_admin", "customer", "super_admin")).toBe(false);
    expect(canAssignRole("super_admin", "super_admin", "customer")).toBe(false);
  });

  it("denies organizers and customers", () => {
    expect(canAssignRole("organizer", "customer", "organizer")).toBe(false);
    expect(canAssignRole("customer", "customer", "organizer")).toBe(false);
  });
});

describe("canManageUser", () => {
  const user = (id: string, role: "super_admin" | "admin" | "organizer" | "customer") => ({ id, role });

  it("lets admins manage organizers and customers", () => {
    expect(canManageUser(user("a", "admin"), user("b", "organizer"))).toBe(true);
    expect(canManageUser(user("a", "admin"), user("b", "customer"))).toBe(true);
  });

  it("lets only the super admin manage admins", () => {
    expect(canManageUser(user("a", "admin"), user("b", "admin"))).toBe(false);
    expect(canManageUser(user("s", "super_admin"), user("b", "admin"))).toBe(true);
  });

  it("never lets anyone manage the super admin or themselves", () => {
    expect(canManageUser(user("s", "super_admin"), user("t", "super_admin"))).toBe(false);
    expect(canManageUser(user("a", "admin"), user("t", "super_admin"))).toBe(false);
    expect(canManageUser(user("s", "super_admin"), user("s", "super_admin"))).toBe(false);
    expect(canManageUser(user("a", "admin"), user("a", "admin"))).toBe(false);
  });

  it("denies organizers and customers", () => {
    expect(canManageUser(user("o", "organizer"), user("c", "customer"))).toBe(false);
    expect(canManageUser(user("c", "customer"), user("o", "organizer"))).toBe(false);
  });
});
