import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createEventAction,
  deleteEventAction,
  retryEventRefundsAction,
  setEventFeaturedAction,
  setEventStatusAction,
  updateEventAction,
} from "@/modules/event/actions";
import type { EventListQuery } from "@/modules/event/event-list.types";
import type { EventFormValues } from "@/modules/event/event-write.types";
import { eventsQueryKey } from "@/modules/event/hooks/use-events";
import {
  createEventMutation,
  deleteEventMutation,
  eventsInvalidationKey,
  retryEventRefundsMutation,
  setEventFeaturedMutation,
  setEventStatusMutation,
  unwrap,
  updateEventMutation,
} from "@/modules/event/hooks/use-event-mutations";

vi.mock("@/modules/event/actions", () => ({
  createEventAction: vi.fn(),
  updateEventAction: vi.fn(),
  deleteEventAction: vi.fn(),
  retryEventRefundsAction: vi.fn(),
  setEventStatusAction: vi.fn(),
  setEventFeaturedAction: vi.fn(),
}));

const id = "7b0c2f4e-6d52-4d0e-9a55-2f3f6c0f8a11";
const values: EventFormValues = {
  title: "Concierto",
  description: "",
  categoryId: id,
  venueId: id,
  date: "2027-01-01",
  time: "20:00",
  coverImageUrl: "",
  zones: [],
};

beforeEach(() => vi.resetAllMocks());

describe("eventsInvalidationKey", () => {
  it("is the prefix of the key useEvents caches under", () => {
    const query: EventListQuery = { q: "", page: 1, pageSize: 8 };
    expect(eventsInvalidationKey).toEqual(["events"]);
    expect(eventsQueryKey(query).slice(0, eventsInvalidationKey.length)).toEqual(eventsInvalidationKey);
  });
});

describe("unwrap", () => {
  it("returns the data on success", () => {
    expect(unwrap({ ok: true, data: { id } })).toEqual({ id });
  });

  it("throws the action's message on failure", () => {
    expect(() => unwrap({ ok: false, error: "Tiene ventas: cancélalo." })).toThrow("Tiene ventas: cancélalo.");
  });
});

describe("mutation functions", () => {
  it("create passes the form values and returns the new id", async () => {
    vi.mocked(createEventAction).mockResolvedValue({ ok: true, data: { id } });
    await expect(createEventMutation(values)).resolves.toEqual({ id });
    expect(createEventAction).toHaveBeenCalledWith(values);
  });

  it("update sends the id with the values", async () => {
    vi.mocked(updateEventAction).mockResolvedValue({ ok: true, data: undefined });
    await updateEventMutation({ id, ...values });
    expect(updateEventAction).toHaveBeenCalledWith({ id, ...values });
  });

  it("delete and status change send their variables", async () => {
    vi.mocked(deleteEventAction).mockResolvedValue({ ok: true, data: undefined });
    vi.mocked(setEventStatusAction).mockResolvedValue({ ok: true, data: undefined });
    await deleteEventMutation({ id });
    await setEventStatusMutation({ id, status: "published" });
    expect(deleteEventAction).toHaveBeenCalledWith({ id });
    expect(setEventStatusAction).toHaveBeenCalledWith({ id, status: "published" });
  });

  it("reject with the action's error when it is not ok", async () => {
    vi.mocked(setEventStatusAction).mockResolvedValue({ ok: false, error: "No se puede publicar." });
    await expect(setEventStatusMutation({ id, status: "published" })).rejects.toThrow("No se puede publicar.");
  });

  it("feature sends the id with the flag", async () => {
    vi.mocked(setEventFeaturedAction).mockResolvedValue({ ok: true, data: undefined });
    await expect(setEventFeaturedMutation({ id, featured: true })).resolves.toBeUndefined();
    expect(setEventFeaturedAction).toHaveBeenCalledWith({ id, featured: true });
  });

  it("retry refunds sends the event id and returns the dispatch counts", async () => {
    const data = { dispatched: 2, failed: 0, pending: 0 };
    vi.mocked(retryEventRefundsAction).mockResolvedValue({ ok: true, data });
    await expect(retryEventRefundsMutation({ id })).resolves.toEqual(data);
    expect(retryEventRefundsAction).toHaveBeenCalledWith({ id });
  });

  it("retry refunds rejects with the action's error when it is not ok", async () => {
    vi.mocked(retryEventRefundsAction).mockResolvedValue({
      ok: false,
      error: "Solo se pueden reintentar los reembolsos de un evento cancelado.",
    });
    await expect(retryEventRefundsMutation({ id })).rejects.toThrow(
      "Solo se pueden reintentar los reembolsos de un evento cancelado.",
    );
  });

  it("feature rejects with the action's error when it is not ok", async () => {
    vi.mocked(setEventFeaturedAction).mockResolvedValue({
      ok: false,
      error: "No tienes permiso para realizar esta acción.",
    });
    await expect(setEventFeaturedMutation({ id, featured: false })).rejects.toThrow(
      "No tienes permiso para realizar esta acción.",
    );
  });
});
