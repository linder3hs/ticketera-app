import { beforeEach, describe, expect, it } from "vitest";

import { useOrganizerStore } from "@/modules/organizer/organizer.store";
import type { CreateEventInput } from "@/modules/organizer/organizer.types";

const INPUT: CreateEventInput = {
  name: " Festival de verano ",
  category: "Festivales",
  description: "",
  date: "2027-01-15",
  time: "18:00",
  venue: "Costa Verde",
  city: "Lima",
  imageUrl: "",
  ticketTypes: [
    { name: "General", price: "120", quantity: "500" },
    { name: "VIP", price: "250", quantity: "50" },
  ],
};

const store = () => useOrganizerStore.getState();

describe("organizer.store", () => {
  beforeEach(() => useOrganizerStore.setState({ createdEvents: [], notice: null }));

  it("saves a published event with capacity and starting price", () => {
    const event = store().saveEvent(INPUT, "published", "org-1");
    expect(event).toMatchObject({
      id: "org-1",
      title: "Festival de verano",
      status: "published",
      sold: 0,
      capacity: 550,
      priceFrom: 120,
    });
    expect(store().createdEvents).toEqual([event]);
    expect(store().notice).toBe("“Festival de verano” se publicó.");
  });

  it("saves drafts newest first and clears the notice", () => {
    store().saveEvent(INPUT, "published", "org-1");
    store().saveEvent({ ...INPUT, name: "Borrador" }, "draft", "org-2");
    expect(store().createdEvents.map((event) => event.id)).toEqual(["org-2", "org-1"]);
    expect(store().notice).toContain("borrador");

    store().clearNotice();
    expect(store().notice).toBeNull();
  });
});
