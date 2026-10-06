import type { eventStatus } from "@/db/schema";
import type { EventCapabilities } from "@/modules/event/event-write.types";

export type EventStatus = (typeof eventStatus.enumValues)[number];

/** Filters of a managed-events list (organizer panel, admin views). */
export interface EventListQuery {
  q: string;
  status?: EventStatus;
  /** Inclusive range of event days (`YYYY-MM-DD`, Lima). */
  dateFrom?: string;
  dateTo?: string;
  /** Only honoured for admins; organizers are always scoped to themselves. */
  organizerId?: string;
  page: number;
  pageSize: number;
}

/** One event with its sales, safe to send to the client. */
export interface ManagedEventRow {
  id: string;
  title: string;
  category: string;
  coverImageUrl: string | null;
  /** `YYYY-MM-DD` in the venue's calendar day (Lima). */
  date: string;
  venue: string;
  city: string;
  status: EventStatus;
  /** Shown in the landing's Hero while it is also published and upcoming. */
  featured: boolean;
  currency: string;
  sold: number;
  capacity: number;
  revenueCents: number;
  /** What the actor may do with the event; the UI only hides, the server is the real gate. */
  capabilities: EventCapabilities;
}

export interface EventsPage {
  items: ManagedEventRow[];
  total: number;
  page: number;
  pageCount: number;
}

export interface SalesSummary {
  sold: number;
  revenueCents: number;
  published: number;
}

export type EventsResult = { ok: true; data: EventsPage } | { ok: false; error: string };
