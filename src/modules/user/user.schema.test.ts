import { describe, expect, it } from "vitest";

import {
  changeRoleSchema,
  deleteUserSchema,
  impersonateUserSchema,
  inviteStaffSchema,
  parseUsersQuery,
  updateUserSchema,
} from "@/modules/user/user.schema";

describe("inviteStaffSchema", () => {
  it("lowercases the email and accepts admin/organizer", () => {
    expect(inviteStaffSchema.parse({ email: "Ana@Example.com", role: "organizer" })).toEqual({
      email: "ana@example.com",
      role: "organizer",
    });
  });

  it("rejects customer and super_admin as invitation roles", () => {
    expect(inviteStaffSchema.safeParse({ email: "a@b.co", role: "customer" }).success).toBe(false);
    expect(inviteStaffSchema.safeParse({ email: "a@b.co", role: "super_admin" }).success).toBe(false);
  });
});

describe("changeRoleSchema", () => {
  it("rejects super_admin and non-uuid ids", () => {
    const userId = "0b0e4c1e-6c54-4f0e-9d0e-3a9f4b1c2d3e";
    expect(changeRoleSchema.safeParse({ userId, role: "super_admin" }).success).toBe(false);
    expect(changeRoleSchema.safeParse({ userId: "nope", role: "admin" }).success).toBe(false);
    expect(changeRoleSchema.safeParse({ userId, role: "admin" }).success).toBe(true);
  });
});

describe("updateUserSchema", () => {
  const userId = "0b0e4c1e-6c54-4f0e-9d0e-3a9f4b1c2d3e";

  it("accepts a role with an optional organizer status", () => {
    expect(updateUserSchema.safeParse({ userId, role: "organizer", status: "suspended" }).success).toBe(true);
    expect(updateUserSchema.safeParse({ userId, role: "customer" }).success).toBe(true);
  });

  it("rejects pending as a manual status, super_admin and bad ids", () => {
    expect(updateUserSchema.safeParse({ userId, role: "organizer", status: "pending" }).success).toBe(false);
    expect(updateUserSchema.safeParse({ userId, role: "super_admin" }).success).toBe(false);
    expect(updateUserSchema.safeParse({ userId: "nope", role: "admin" }).success).toBe(false);
  });
});

describe("deleteUserSchema", () => {
  it("requires a uuid", () => {
    expect(deleteUserSchema.safeParse({ userId: "nope" }).success).toBe(false);
    expect(deleteUserSchema.safeParse({ userId: "0b0e4c1e-6c54-4f0e-9d0e-3a9f4b1c2d3e" }).success).toBe(true);
  });
});

describe("impersonateUserSchema", () => {
  it("accepts a uuid and rejects anything else", () => {
    const userId = "0b0e4c1e-6c54-4f0e-9d0e-3a9f4b1c2d3e";
    expect(impersonateUserSchema.parse({ userId })).toEqual({ userId });
    expect(impersonateUserSchema.safeParse({ userId: "nope" }).success).toBe(false);
    expect(impersonateUserSchema.safeParse({}).success).toBe(false);
  });
});

describe("parseUsersQuery", () => {
  it("uses defaults when the URL has no params", () => {
    expect(parseUsersQuery({})).toEqual({ q: "", role: undefined, status: undefined, page: 1, pageSize: 8 });
  });

  it("reads valid params, trimming the search term", () => {
    expect(parseUsersQuery({ q: "  ana ", role: "organizer", status: "pending", page: "3", pageSize: "16" })).toEqual({
      q: "ana",
      role: "organizer",
      status: "pending",
      page: 3,
      pageSize: 16,
    });
  });

  it("falls back to defaults on invalid values", () => {
    expect(parseUsersQuery({ role: "root", status: "x", page: "abc", pageSize: "50" })).toEqual({
      q: "",
      role: undefined,
      status: undefined,
      page: 1,
      pageSize: 8,
    });
    expect(parseUsersQuery({ page: "0" }).page).toBe(1);
    expect(parseUsersQuery({ page: "1.5" }).page).toBe(1);
  });

  it("keeps the first value of a repeated param", () => {
    expect(parseUsersQuery({ role: ["admin", "customer"] }).role).toBe("admin");
  });
});
