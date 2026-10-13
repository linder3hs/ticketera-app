import { beforeEach, describe, expect, it, vi } from "vitest";

import { setEventFavoriteAction } from "@/modules/favorite/actions";
import { setFavoriteMutation } from "@/modules/favorite/hooks/use-event-favorite";

vi.mock("@/modules/favorite/actions", () => ({
  setEventFavoriteAction: vi.fn(),
}));

const eventId = "7b0c2f4e-6d52-4d0e-9a55-2f3f6c0f8a11";

describe("setFavoriteMutation", () => {
  beforeEach(() => {
    vi.mocked(setEventFavoriteAction).mockReset();
  });

  it("resolves when the action succeeds", async () => {
    vi.mocked(setEventFavoriteAction).mockResolvedValue({ ok: true });

    await expect(setFavoriteMutation({ eventId, favorite: true })).resolves.toBeUndefined();
  });

  it("throws the action's error message when it fails", async () => {
    vi.mocked(setEventFavoriteAction).mockResolvedValue({ ok: false, error: "Este evento ya no está disponible." });

    await expect(setFavoriteMutation({ eventId, favorite: true })).rejects.toThrow("Este evento ya no está disponible.");
  });

  it("calls the action with exactly the event id and the desired state", async () => {
    vi.mocked(setEventFavoriteAction).mockResolvedValue({ ok: true });

    await setFavoriteMutation({ eventId, favorite: false });

    expect(setEventFavoriteAction).toHaveBeenCalledExactlyOnceWith({ eventId, favorite: false });
  });
});
