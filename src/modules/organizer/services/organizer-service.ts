import { getUpcomingEvents } from "@/modules/event/services/event-service";
import type { OrganizerEvent } from "@/modules/organizer/organizer.types";

/** Sales of the sample organizer's events (mock), by catalog event id. */
const SALES: { eventId: string; sold: number; capacity: number; status: OrganizerEvent["status"] }[] = [
  { eventId: "evt-002", sold: 7420, capacity: 8000, status: "published" },
  { eventId: "evt-004", sold: 312, capacity: 420, status: "published" },
  { eventId: "evt-010", sold: 414, capacity: 1200, status: "published" },
  { eventId: "evt-005", sold: 0, capacity: 1500, status: "draft" },
];

/** The sample organizer's events with their sales, soonest first. */
export async function getOrganizerEvents(): Promise<OrganizerEvent[]> {
  const catalog = await getUpcomingEvents();
  return SALES.flatMap(({ eventId, ...sales }) => {
    const event = catalog.find((item) => item.id === eventId);
    if (!event) return [];
    return [
      {
        id: event.id,
        title: event.title,
        category: event.category,
        imageUrl: event.imageUrl,
        date: event.date,
        venue: event.venue,
        city: event.city,
        priceFrom: event.priceFrom,
        currency: event.currency,
        ...sales,
      },
    ];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

/** Headline numbers; revenue = tickets sold × starting price, drafts excluded. */
export function getOrganizerKpis(events: OrganizerEvent[]) {
  const published = events.filter((event) => event.status === "published");
  return {
    sold: published.reduce((sum, event) => sum + event.sold, 0),
    revenue: published.reduce((sum, event) => sum + event.sold * event.priceFrom, 0),
    published: published.length,
  };
}
