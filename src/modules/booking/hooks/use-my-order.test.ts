import { beforeEach, describe, expect, it, vi } from "vitest";

import { getMyOrderAction } from "@/modules/booking/actions";
import { fetchMyOrder, myOrderQueryKey } from "@/modules/booking/hooks/use-my-order";
import type { MyOrder } from "@/modules/booking/order.types";

vi.mock("@/modules/booking/actions", () => ({ getMyOrderAction: vi.fn() }));

const order: MyOrder = {
  id: "order-1",
  code: "TK-7H3KQ9XM",
  status: "pending",
  total: 90,
  currency: "PEN",
  buyerName: "Ana Perez",
  buyerEmail: "ana@example.com",
  event: {
    id: "event-1",
    slug: "rock-fest",
    title: "Rock Fest",
    category: "Música",
    imageUrl: "",
    imageAlt: "Rock Fest",
    date: "2026-10-19",
    startsAt: "20:00",
    venue: "Estadio Nacional",
    address: "Av. José Díaz s/n",
    city: "Lima",
    currency: "PEN",
  },
  tickets: [],
};

beforeEach(() => vi.mocked(getMyOrderAction).mockReset());

describe("myOrderQueryKey", () => {
  it("changes with the code so each order caches separately", () => {
    expect(myOrderQueryKey("TK-7H3KQ9XM")).toEqual(myOrderQueryKey("TK-7H3KQ9XM"));
    expect(myOrderQueryKey("TK-7H3KQ9XM")).not.toEqual(myOrderQueryKey("TK-AAAAAAAA"));
  });
});

describe("fetchMyOrder", () => {
  it("returns the order on success, sending only its code", async () => {
    vi.mocked(getMyOrderAction).mockResolvedValue({ ok: true, data: order });
    await expect(fetchMyOrder("TK-7H3KQ9XM")).resolves.toEqual(order);
    expect(getMyOrderAction).toHaveBeenCalledWith({ code: "TK-7H3KQ9XM" });
  });

  it("returns null when the order is not found", async () => {
    vi.mocked(getMyOrderAction).mockResolvedValue({ ok: true, data: null });
    await expect(fetchMyOrder("TK-7H3KQ9XM")).resolves.toBeNull();
  });

  it("throws the server's message on failure", async () => {
    vi.mocked(getMyOrderAction).mockResolvedValue({ ok: false, error: "Datos inválidos." });
    await expect(fetchMyOrder("TK-7H3KQ9XM")).rejects.toThrow("Datos inválidos.");
  });
});
