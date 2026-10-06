import { describe, expect, it } from "vitest";

import { buildUsersHref } from "@/modules/user/hooks/use-users-query";
import type { UsersQuery } from "@/modules/user/user.types";

const base: UsersQuery = { q: "", role: undefined, status: undefined, page: 1, pageSize: 8 };

describe("buildUsersHref", () => {
  it("omits defaults", () => {
    expect(buildUsersHref("/admin/users", base, {})).toBe("/admin/users");
  });

  it("writes only the active params", () => {
    expect(buildUsersHref("/admin/users", base, { q: "ana", role: "organizer", pageSize: 16 })).toBe(
      "/admin/users?q=ana&role=organizer&pageSize=16",
    );
  });

  it("goes back to page 1 when a filter changes", () => {
    expect(buildUsersHref("/admin/users", { ...base, page: 3 }, { role: "admin" })).toBe("/admin/users?role=admin");
  });

  it("keeps the other params when moving between pages", () => {
    expect(buildUsersHref("/admin/users", { ...base, q: "ana" }, { page: 2 })).toBe("/admin/users?q=ana&page=2");
  });

  it("removes a filter set to undefined", () => {
    expect(buildUsersHref("/admin/users", { ...base, role: "admin" }, { role: undefined })).toBe("/admin/users");
  });
});
