import { describe, expect, it } from "vitest";

import { eventListQuerySchema } from "@/modules/event/event-list.schema";

describe("eventListQuerySchema", () => {
  it("applies defaults", () => {
    expect(eventListQuerySchema.parse({})).toEqual({ q: "", page: 1, pageSize: 8 });
  });

  it("trims the search and accepts a status", () => {
    expect(eventListQuerySchema.parse({ q: "  rock ", status: "published" })).toMatchObject({ q: "rock", status: "published" });
  });

  it("rejects unknown page sizes, statuses and non-uuid organizers", () => {
    expect(eventListQuerySchema.safeParse({ pageSize: 50 }).success).toBe(false);
    expect(eventListQuerySchema.safeParse({ status: "deleted" }).success).toBe(false);
    expect(eventListQuerySchema.safeParse({ organizerId: "x" }).success).toBe(false);
    expect(eventListQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it("accepts a day range and rejects malformed days", () => {
    expect(eventListQuerySchema.parse({ dateFrom: "2026-10-01", dateTo: "2026-10-31" })).toMatchObject({ dateFrom: "2026-10-01", dateTo: "2026-10-31" });
    expect(eventListQuerySchema.safeParse({ dateFrom: "01/10/2026" }).success).toBe(false);
  });
});
