import { describe, expect, it } from "vitest";

import { getCapacity, getCreateEventErrors, getLowestPrice } from "@/modules/organizer/create-event.schema";
import type { CreateEventInput } from "@/modules/organizer/organizer.types";

const EMPTY: CreateEventInput = {
  name: "",
  category: "Conciertos",
  description: "",
  date: "",
  time: "",
  venue: "",
  city: "",
  imageUrl: "",
  ticketTypes: [{ name: "", price: "", quantity: "" }],
};

const COMPLETE: CreateEventInput = {
  ...EMPTY,
  name: "Festival de verano",
  date: "2027-01-15",
  time: "18:00",
  venue: "Costa Verde",
  city: "Lima",
  ticketTypes: [
    { name: "General", price: "120", quantity: "500" },
    { name: "VIP", price: "250.50", quantity: "50" },
  ],
};

describe("create-event.schema", () => {
  it("only asks drafts for a name", () => {
    expect(getCreateEventErrors(EMPTY, "draft")).toEqual({ name: expect.any(String) });
    expect(getCreateEventErrors({ ...EMPTY, name: "Mi evento" }, "draft")).toEqual({});
  });

  it("asks everything to publish", () => {
    expect(Object.keys(getCreateEventErrors(EMPTY, "published")).sort()).toEqual([
      "city",
      "date",
      "name",
      "ticketTypes.0.name",
      "ticketTypes.0.price",
      "ticketTypes.0.quantity",
      "time",
      "venue",
    ]);
    expect(getCreateEventErrors(COMPLETE, "published")).toEqual({});
  });

  it("validates each ticket type", () => {
    const errors = getCreateEventErrors(
      { ...COMPLETE, ticketTypes: [{ name: "General", price: "-5", quantity: "0" }] },
      "published",
    );
    expect(errors).toEqual({ "ticketTypes.0.price": "Precio inválido.", "ticketTypes.0.quantity": "Mínimo 1." });
  });

  it("computes capacity and lowest price", () => {
    expect(getCapacity(COMPLETE.ticketTypes)).toBe(550);
    expect(getCapacity(EMPTY.ticketTypes)).toBe(0);
    expect(getLowestPrice(COMPLETE.ticketTypes)).toBe(120);
    expect(getLowestPrice(EMPTY.ticketTypes)).toBeNull();
  });
});
