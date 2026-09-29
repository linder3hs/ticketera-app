import { beforeEach, describe, expect, it } from "vitest";

import { MOCK_GOOGLE_USER, nameFromEmail, useAuthStore } from "@/modules/auth/auth.store";

const store = () => useAuthStore.getState();

describe("auth.store", () => {
  beforeEach(() => store().logout());

  it("signs in by email, naming the user after the address", () => {
    store().login(" ana.perez@mail.com ");
    expect(store().user).toEqual({ name: "Ana Perez", email: "ana.perez@mail.com", provider: "email" });
  });

  it("registers with the given name", () => {
    store().register(" Luis Soto ", "luis@mail.com");
    expect(store().user).toEqual({ name: "Luis Soto", email: "luis@mail.com", provider: "email" });
  });

  it("signs in with the mock Google account", () => {
    expect(store().loginWithGoogle()).toEqual(MOCK_GOOGLE_USER);
    expect(store().user?.provider).toBe("google");
  });

  it("signs out", () => {
    store().login("ana@mail.com");
    store().logout();
    expect(store().user).toBeNull();
  });

  it("derives display names from email addresses", () => {
    expect(nameFromEmail("maria_jose-lopez@x.com")).toBe("Maria Jose Lopez");
  });
});
