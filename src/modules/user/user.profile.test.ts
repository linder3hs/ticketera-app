import type { User } from "@clerk/nextjs/server";
import { describe, expect, it } from "vitest";

import { resolveInitialRole, toProfile } from "@/modules/user/user.profile";
import type { ClerkProfile } from "@/modules/user/user.types";

const SUPER = "linderhassinger01@gmail.com";

function profile(overrides: Partial<ClerkProfile> = {}): ClerkProfile {
  return {
    clerkId: "user_1",
    email: "ana@example.com",
    emailVerified: true,
    fullName: "Ana",
    avatarUrl: null,
    provider: "email",
    metadataRole: undefined,
    ...overrides,
  };
}

describe("resolveInitialRole", () => {
  it("makes the verified super admin email a super_admin", () => {
    expect(resolveInitialRole(profile({ email: SUPER }), SUPER)).toBe("super_admin");
  });

  it("ignores the super admin email when it is not verified", () => {
    expect(resolveInitialRole(profile({ email: SUPER, emailVerified: false }), SUPER)).toBe("customer");
  });

  it("takes admin/organizer from the server-set invitation metadata", () => {
    expect(resolveInitialRole(profile({ metadataRole: "organizer" }), SUPER)).toBe("organizer");
    expect(resolveInitialRole(profile({ metadataRole: "admin" }), SUPER)).toBe("admin");
  });

  it("never grants super_admin through metadata; defaults to customer", () => {
    expect(resolveInitialRole(profile({ metadataRole: "super_admin" }), SUPER)).toBe("customer");
    expect(resolveInitialRole(profile(), SUPER)).toBe("customer");
  });

  it("promotes nobody when SUPER_ADMIN_EMAIL is unset", () => {
    expect(resolveInitialRole(profile({ email: SUPER }), undefined)).toBe("customer");
  });
});

describe("toProfile", () => {
  const clerkUser = {
    id: "user_1",
    firstName: "Ana",
    lastName: "Pérez",
    imageUrl: "https://img/a.png",
    primaryEmailAddressId: "e2",
    emailAddresses: [
      { id: "e1", emailAddress: "other@example.com", verification: { status: "verified" } },
      { id: "e2", emailAddress: "Ana@Example.com", verification: { status: "verified" } },
    ],
    externalAccounts: [{ provider: "oauth_google" }],
    publicMetadata: { role: "organizer" },
  } as unknown as User;

  it("maps the primary email, name, provider and metadata role", () => {
    expect(toProfile(clerkUser)).toEqual({
      clerkId: "user_1",
      email: "ana@example.com",
      emailVerified: true,
      fullName: "Ana Pérez",
      avatarUrl: "https://img/a.png",
      provider: "google",
      metadataRole: "organizer",
    });
  });

  it("returns null without a primary email", () => {
    expect(toProfile({ ...clerkUser, primaryEmailAddressId: null } as unknown as User)).toBeNull();
  });
});
