import { beforeEach, describe, expect, it, vi } from "vitest";

import { listEventsAction } from "@/modules/event/actions";
import type { EventListQuery } from "@/modules/event/event-list.types";
import { eventsQueryKey, fetchEvents } from "@/modules/event/hooks/use-events";

vi.mock("@/modules/event/actions", () => ({ listEventsAction: vi.fn() }));

const query: EventListQuery = { q: "", page: 1, pageSize: 8 };
const page = { items: [], total: 0, page: 1, pageCount: 1 };

beforeEach(() => vi.mocked(listEventsAction).mockReset());

describe("eventsQueryKey", () => {
  it("changes with the query so each filter caches separately", () => {
    expect(eventsQueryKey(query)).toEqual(eventsQueryKey({ ...query }));
    expect(eventsQueryKey(query)).not.toEqual(eventsQueryKey({ ...query, status: "draft" }));
  });
});

describe("fetchEvents", () => {
  it("returns the page on success", async () => {
    vi.mocked(listEventsAction).mockResolvedValue({ ok: true, data: page });
    await expect(fetchEvents(query)).resolves.toEqual(page);
  });

  it("throws the server's message on failure", async () => {
    vi.mocked(listEventsAction).mockResolvedValue({ ok: false, error: "Datos inválidos." });
    await expect(fetchEvents(query)).rejects.toThrow("Datos inválidos.");
  });
});
