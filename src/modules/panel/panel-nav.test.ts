import { describe, expect, it } from "vitest";

import { getActiveHref, getNavSections } from "@/modules/panel/panel-nav";

const labels = (role: Parameters<typeof getNavSections>[0]) => getNavSections(role).map((section) => section.label);

const itemLabels = (role: Parameters<typeof getNavSections>[0]) =>
  getNavSections(role).flatMap((section) => section.items.map((item) => item.label));

describe("getNavSections", () => {
  it("shows only Organizador to organizers", () => {
    expect(labels("organizer")).toEqual(["Organizador"]);
  });

  it("shows Administración first, then Organizador, to admins and super admins", () => {
    expect(labels("admin")).toEqual(["Administración", "Organizador"]);
    expect(labels("super_admin")).toEqual(["Administración", "Plataforma", "Organizador"]);
  });

  it("shows Ajustes only to the super admin", () => {
    expect(itemLabels("super_admin")).toContain("Ajustes");
    expect(itemLabels("admin")).not.toContain("Ajustes");
    expect(itemLabels("organizer")).not.toContain("Ajustes");
  });

  it("shows Configuración to organizers and above, not to customers", () => {
    expect(itemLabels("organizer")).toContain("Configuración");
    expect(itemLabels("admin")).toContain("Configuración");
    expect(itemLabels("super_admin")).toContain("Configuración");
    expect(itemLabels("customer")).not.toContain("Configuración");
  });

  it("shows Recintos to organizers and above, not to customers", () => {
    expect(itemLabels("organizer")).toContain("Recintos");
    expect(itemLabels("admin")).toContain("Recintos");
    expect(itemLabels("super_admin")).toContain("Recintos");
    expect(itemLabels("customer")).not.toContain("Recintos");
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

  it("lights up Configuración on its page and sub-routes, not Eventos", () => {
    expect(getActiveHref(sections, "/organizer/settings")).toBe("/organizer/settings");
    expect(getActiveHref(sections, "/organizer/settings/connect/refresh")).toBe("/organizer/settings");
  });

  it("lights up Recintos on its page and sub-routes, not Eventos", () => {
    expect(getActiveHref(sections, "/organizer/venues")).toBe("/organizer/venues");
    expect(getActiveHref(sections, "/organizer/venues/abc")).toBe("/organizer/venues");
    expect(getActiveHref(sections, "/organizer/venues/new")).toBe("/organizer/venues");
  });

  it("returns undefined outside the panel", () => {
    expect(getActiveHref(sections, "/events")).toBeUndefined();
  });
});
