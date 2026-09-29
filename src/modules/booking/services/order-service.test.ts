import { describe, expect, it } from "vitest";

import { getMyOrders, splitOrdersByDate } from "@/modules/booking/services/order-service";
import { getEventById } from "@/modules/event/services/event-service";
import type { Order } from "@/modules/booking/booking.types";

const order = (id: string, eventId: string): Order => ({
  id,
  eventId,
  lines: [],
  count: 1,
  total: 0,
  currency: "PEN",
  method: "card",
  buyerName: "",
  email: "",
});

describe("order-service", () => {
  it("mock orders point to existing events and add up", async () => {
    for (const item of await getMyOrders()) {
      expect(await getEventById(item.eventId)).toBeDefined();
      expect(item.lines.reduce((sum, line) => sum + line.quantity, 0)).toBe(item.count);
    }
  });

  it("splits orders by event date and sorts each group", () => {
    const dates = { a: "2026-10-01", b: "2026-12-01", c: "2026-08-01", d: "2026-09-01" };
    const { upcoming, past } = splitOrdersByDate(
      [order("1", "b"), order("2", "a"), order("3", "c"), order("4", "d"), order("5", "unknown")],
      dates,
      "2026-09-29",
    );
    expect(upcoming.map((item) => item.id)).toEqual(["2", "1"]);
    expect(past.map((item) => item.id)).toEqual(["4", "3"]);
  });

  it("counts an event happening today as upcoming", () => {
    const { upcoming } = splitOrdersByDate([order("1", "a")], { a: "2026-09-29" }, "2026-09-29");
    expect(upcoming).toHaveLength(1);
  });
});
