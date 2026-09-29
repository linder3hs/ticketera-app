import { describe, expect, it } from "vitest";

import { getFieldErrors, getSafeNext, loginSchema, registerSchema } from "@/modules/auth/auth.schema";

describe("auth.schema", () => {
  it("accepts a valid login and registration", () => {
    expect(getFieldErrors(loginSchema, { email: "ana@mail.com", password: "x" })).toEqual({});
    expect(
      getFieldErrors(registerSchema, {
        fullName: "Ana Pérez",
        email: "ana@mail.com",
        password: "12345678",
        acceptTerms: true,
      }),
    ).toEqual({});
  });

  it("reports login errors", () => {
    expect(Object.keys(getFieldErrors(loginSchema, { email: "ana", password: "" }))).toEqual(["email", "password"]);
  });

  it("reports every registration error at once", () => {
    const errors = getFieldErrors(registerSchema, { fullName: "", email: "x", password: "123", acceptTerms: false });
    expect(Object.keys(errors).sort()).toEqual(["acceptTerms", "email", "fullName", "password"]);
    expect(errors.password).toBe("Usa al menos 8 caracteres.");
  });
});

describe("getSafeNext", () => {
  it("keeps local paths and rejects everything else", () => {
    expect(getSafeNext("/organizer")).toBe("/organizer");
    expect(getSafeNext(["/events", "/x"])).toBe("/events");
    expect(getSafeNext("//evil.com")).toBe("/my-tickets");
    expect(getSafeNext("https://evil.com")).toBe("/my-tickets");
    expect(getSafeNext(undefined)).toBe("/my-tickets");
  });
});
