import { describe, expect, it } from "vitest";

import { getActiveHref, getNavSections } from "@/modules/panel/panel-nav";

const labels = (role: Parameters<typeof getNavSections>[0]) => getNavSections(role).map((section) => section.label);

describe("getNavSections", () => {
  it("shows only Organizador to organizers", () => {
    expect(labels("organizer")).toEqual(["Organizador"]);
  });

  it("shows Administración first, then Organizador, to admins and super admins", () => {
    expect(labels("admin")).toEqual(["Administración", "Organizador"]);
    expect(labels("super_admin")).toEqual(["Administración", "Organizador"]);
  });

  it("shows nothing to customers", () => {
    expect(getNavSections("customer")).toEqual([]);
  });
});

describe("getActiveHref", () => {
  const sections = getNavSections("admin");

  it("matches an exact path", () => {
    expect(getActiveHref(sections, "/admin/users")).toBe("/admin/users");
  });

  it("prefers the longest match", () => {
    expect(getActiveHref(sections, "/organizer")).toBe("/organizer");
    expect(getActiveHref(sections, "/admin/users/123")).toBe("/admin/users");
  });

  it("matches nested paths of an item", () => {
    expect(getActiveHref(sections, "/admin/users/123")).toBe("/admin/users");
  });

  it("keeps Eventos active on its sub-pages (create, edit)", () => {
    expect(getActiveHref(sections, "/organizer/events/new")).toBe("/organizer");
  });

  it("returns undefined outside the panel", () => {
    expect(getActiveHref(sections, "/events")).toBeUndefined();
  });
});
