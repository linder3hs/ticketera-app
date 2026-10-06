import { z } from "zod";

export const EVENT_PAGE_SIZES = [8, 16, 24] as const;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const eventListQuerySchema = z.object({
  q: z.string().trim().max(100).default(""),
  status: z.enum(["draft", "published", "cancelled", "finished"]).optional(),
  /** Inclusive range of event days (`YYYY-MM-DD`, Lima). */
  dateFrom: day.optional(),
  dateTo: day.optional(),
  organizerId: z.uuid().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.literal(EVENT_PAGE_SIZES).default(EVENT_PAGE_SIZES[0]),
});
