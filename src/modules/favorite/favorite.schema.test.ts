import { describe, expect, it } from "vitest";

import { setFavoriteSchema } from "@/modules/favorite/favorite.schema";

const eventId = "b3b0f1f2-7a54-4c1e-9d5a-0c2f6a1e8d34";

describe("setFavoriteSchema", () => {
  it("accepts favorite true and false", () => {
    expect(setFavoriteSchema.parse({ eventId, favorite: true })).toEqual({ eventId, favorite: true });
    expect(setFavoriteSchema.parse({ eventId, favorite: false })).toEqual({ eventId, favorite: false });
  });

  it("rejects an eventId that is not a uuid", () => {
    expect(setFavoriteSchema.safeParse({ eventId: "not-a-uuid", favorite: true }).success).toBe(false);
  });

  it("rejects a missing favorite", () => {
    expect(setFavoriteSchema.safeParse({ eventId }).success).toBe(false);
  });

  it("rejects favorite as a string", () => {
    expect(setFavoriteSchema.safeParse({ eventId, favorite: "true" }).success).toBe(false);
  });

  it("rejects non-object input", () => {
    expect(setFavoriteSchema.safeParse(null).success).toBe(false);
    expect(setFavoriteSchema.safeParse("x").success).toBe(false);
    expect(setFavoriteSchema.safeParse([eventId, true]).success).toBe(false);
  });
});
