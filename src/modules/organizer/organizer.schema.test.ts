import { describe, expect, it } from "vitest";

import { isValidRuc, organizerProfileSchema } from "@/modules/organizer/organizer.schema";

describe("isValidRuc", () => {
  it.each(["20131312955", "20100070970", "20100047218"])("accepts %s", (ruc) => {
    expect(isValidRuc(ruc)).toBe(true);
  });

  it.each([
    ["wrong check digit", "20100070971"],
    ["wrong check digit (natural person)", "10456789012"],
    ["unknown prefix", "30100070970"],
    ["10 digits", "2010007097"],
    ["12 digits", "201000709700"],
    ["letters", "2010007097a"],
    ["spaces", "20100 70970"],
    ["surrounding space", " 20100070970"],
    ["empty", ""],
  ])("rejects %s", (_label, ruc) => {
    expect(isValidRuc(ruc)).toBe(false);
  });
});

describe("organizerProfileSchema", () => {
  const valid = { businessName: "Mi Productora SAC", taxId: "20131312955" };

  it("accepts a valid profile", () => {
    expect(organizerProfileSchema.parse(valid)).toEqual(valid);
  });

  it("trims the business name", () => {
    expect(organizerProfileSchema.parse({ ...valid, businessName: "  Mi Productora  " }).businessName).toBe(
      "Mi Productora",
    );
  });

  it("accepts business names of 2 and 120 characters", () => {
    expect(organizerProfileSchema.safeParse({ ...valid, businessName: "ab" }).success).toBe(true);
    expect(organizerProfileSchema.safeParse({ ...valid, businessName: "a".repeat(120) }).success).toBe(true);
  });

  it("rejects business names that are too short (after trim) or too long", () => {
    expect(organizerProfileSchema.safeParse({ ...valid, businessName: " a " }).success).toBe(false);
    expect(organizerProfileSchema.safeParse({ ...valid, businessName: "   " }).success).toBe(false);
    expect(organizerProfileSchema.safeParse({ ...valid, businessName: "a".repeat(121) }).success).toBe(false);
  });

  it.each([
    ["letters", "2010007097a", "El RUC solo debe contener números."],
    ["spaces", "20100 70970", "El RUC solo debe contener números."],
    ["10 digits", "2010007097", "El RUC debe tener 11 dígitos."],
    ["12 digits", "201000709700", "El RUC debe tener 11 dígitos."],
    ["empty", "", "El RUC debe tener 11 dígitos."],
    ["wrong check digit", "20100070971", "El RUC no es válido."],
    ["unknown prefix", "30100070970", "El RUC no es válido."],
  ])("rejects a tax id with %s", (_label, taxId, message) => {
    const result = organizerProfileSchema.safeParse({ ...valid, taxId });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(message);
  });

  it("rejects missing fields", () => {
    expect(organizerProfileSchema.safeParse({}).success).toBe(false);
  });
});
