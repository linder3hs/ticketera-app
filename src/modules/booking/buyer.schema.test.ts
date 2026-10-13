import { describe, expect, it } from "vitest";

import { DOCUMENT_TYPE_LABELS, DOCUMENT_TYPES, buyerSchema, getBuyerErrors, startCheckoutSchema } from "@/modules/booking/buyer.schema";

const BUYER = {
  fullName: "Ana Pérez",
  email: "ana@mail.com",
  documentType: "dni",
  documentNumber: "12345678",
  phone: "987 654 321",
  acceptTerms: true,
};

describe("buyer.schema", () => {
  it("accepts a valid buyer and normalizes the phone", () => {
    expect(buyerSchema.parse(BUYER)).toMatchObject({ phone: "987654321", documentType: "dni" });
  });

  it("uses the document types of the DB, with a label for each", () => {
    expect(DOCUMENT_TYPES).toEqual(["dni", "ce", "passport"]);
    expect(DOCUMENT_TYPE_LABELS).toEqual({ dni: "DNI", ce: "CE", passport: "Pasaporte" });
  });

  it("applies the document rule of each type", () => {
    expect(getBuyerErrors({ ...BUYER, documentType: "dni", documentNumber: "1234567" })).toHaveProperty("documentNumber");
    expect(getBuyerErrors({ ...BUYER, documentType: "dni", documentNumber: "AB345678" })).toHaveProperty("documentNumber");
    expect(getBuyerErrors({ ...BUYER, documentType: "ce", documentNumber: "A12345" })).toEqual({});
    expect(getBuyerErrors({ ...BUYER, documentType: "ce", documentNumber: "A123" })).toHaveProperty("documentNumber");
    expect(getBuyerErrors({ ...BUYER, documentType: "passport", documentNumber: "AB1234567890" })).toEqual({});
    expect(getBuyerErrors({ ...BUYER, documentType: "passport", documentNumber: "AB12345678901" })).toHaveProperty("documentNumber");
  });

  it("rejects the old UI document labels", () => {
    expect(getBuyerErrors({ ...BUYER, documentType: "DNI" })).toHaveProperty("documentType");
    expect(getBuyerErrors({ ...BUYER, documentType: "Pasaporte" })).toHaveProperty("documentType");
  });

  it("reports one message per invalid field", () => {
    const errors = getBuyerErrors({
      ...BUYER,
      fullName: "A",
      email: "ana",
      documentNumber: "123",
      phone: "12",
      acceptTerms: false,
    });
    expect(Object.keys(errors).sort()).toEqual(["acceptTerms", "documentNumber", "email", "fullName", "phone"]);
    expect(errors.documentNumber).toBe("El DNI tiene 8 dígitos.");
    expect(errors.phone).toBe("Ingresa un celular válido (9 a 15 dígitos).");
  });

  it("requires accepting the terms", () => {
    expect(getBuyerErrors({ ...BUYER, acceptTerms: false })).toEqual({
      acceptTerms: "Debes aceptar los términos para continuar.",
    });
    expect(getBuyerErrors({ ...BUYER, acceptTerms: undefined })).toHaveProperty("acceptTerms");
  });

  it("does not mention card fields", () => {
    const errors = getBuyerErrors({ fullName: "", email: "", documentType: "", documentNumber: "", phone: "" });
    expect(Object.keys(errors).filter((field) => /card|method/i.test(field))).toEqual([]);
    expect(getBuyerErrors(BUYER)).toEqual({});
  });
});

describe("startCheckoutSchema", () => {
  const INPUT = { slug: "rock-fest", ...BUYER };

  it("accepts the slug plus the buyer", () => {
    expect(startCheckoutSchema.parse(INPUT)).toMatchObject({ slug: "rock-fest", phone: "987654321" });
  });

  it("rejects an empty slug", () => {
    expect(startCheckoutSchema.safeParse({ ...INPUT, slug: "" }).success).toBe(false);
    expect(startCheckoutSchema.safeParse({ ...INPUT, slug: "   " }).success).toBe(false);
  });

  it("drops keys the client must not send", () => {
    const parsed = startCheckoutSchema.parse({ ...INPUT, amount: 1, reservationId: "r-1" });
    expect(parsed).not.toHaveProperty("amount");
    expect(parsed).not.toHaveProperty("reservationId");
  });

  it("applies the buyer rules", () => {
    expect(startCheckoutSchema.safeParse({ ...INPUT, documentNumber: "1" }).success).toBe(false);
    expect(startCheckoutSchema.safeParse({ ...INPUT, acceptTerms: false }).success).toBe(false);
    expect(startCheckoutSchema.safeParse({ ...INPUT, email: "x" }).success).toBe(false);
  });
});
