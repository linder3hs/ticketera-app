import { describe, expect, it } from "vitest";

import { checkoutSchema, getCheckoutErrors } from "@/modules/booking/checkout.schema";

const BUYER = {
  fullName: "Ana Pérez",
  email: "ana@mail.com",
  documentType: "DNI",
  documentNumber: "12345678",
  phone: "987 654 321",
  acceptTerms: true,
};

const CARD = {
  method: "card",
  cardNumber: "4111 1111 1111 1111",
  cardExpiry: "12/99",
  cardCvv: "123",
  cardName: "ANA PEREZ",
};

describe("checkout.schema", () => {
  it("accepts a card payment and normalizes numbers", () => {
    const result = checkoutSchema.parse({ ...BUYER, ...CARD });
    expect(result).toMatchObject({ phone: "987654321", cardNumber: "4111111111111111" });
  });

  it("accepts Yape and PagoEfectivo without card data", () => {
    expect(getCheckoutErrors({ ...BUYER, method: "yape" })).toEqual({});
    expect(getCheckoutErrors({ ...BUYER, method: "cash" })).toEqual({});
  });

  it("accepts other document types", () => {
    expect(getCheckoutErrors({ ...BUYER, documentType: "Pasaporte", documentNumber: "AB123456", method: "yape" })).toEqual({});
  });

  it("reports one message per invalid buyer field", () => {
    const errors = getCheckoutErrors({
      ...BUYER,
      fullName: "A",
      email: "ana",
      documentNumber: "123",
      phone: "12",
      acceptTerms: false,
      method: "yape",
    });
    expect(Object.keys(errors).sort()).toEqual(["acceptTerms", "documentNumber", "email", "fullName", "phone"]);
    expect(errors.documentNumber).toBe("El DNI tiene 8 dígitos.");
  });

  it("validates card number, expiry, CVV and name", () => {
    const errors = getCheckoutErrors({
      ...BUYER,
      method: "card",
      cardNumber: "4111",
      cardExpiry: "01/20",
      cardCvv: "1",
      cardName: "",
    });
    expect(Object.keys(errors).sort()).toEqual(["cardCvv", "cardExpiry", "cardName", "cardNumber"]);
  });

  it("rejects impossible expiry months", () => {
    expect(getCheckoutErrors({ ...BUYER, ...CARD, cardExpiry: "13/99" })).toHaveProperty("cardExpiry");
    expect(getCheckoutErrors({ ...BUYER, ...CARD, cardExpiry: "1299" })).toHaveProperty("cardExpiry");
  });
});
