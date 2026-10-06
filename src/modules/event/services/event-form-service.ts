import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { category, event, organizer, venue, venueSeat, venueZone } from "@/db/schema";
import { toLimaDate, toLimaTime } from "@/modules/event/event-list.utils";
import type {
  EventForEdit,
  EventFormOptions,
  OrganizerOption,
  PolicyActor,
  PolicyEvent,
  VenueOption,
} from "@/modules/event/event-write.types";
import { canViewEvent, editableFields, getEventCapabilities, isEventReadOnly } from "@/modules/event/event.policy";
import { formatCents } from "@/modules/event/event-write.utils";
import { getEventFacts, getZoneStates } from "@/modules/event/services/event-facts-service";

/** Categories and venues (with their zones) to pick from in the event form. */
export async function listEventFormOptions(): Promise<EventFormOptions> {
  const [categories, venues, zones] = await Promise.all([
    db.select({ id: category.id, label: category.label }).from(category).orderBy(category.label, category.id),
    db.select({ id: venue.id, name: venue.name, city: venue.city }).from(venue).orderBy(venue.name, venue.id),
    db
      .select({
        id: venueZone.id,
        venueId: venueZone.venueId,
        name: venueZone.name,
        seatingType: venueZone.seatingType,
        capacity: sql<number>`case when ${venueZone.seatingType} = 'general_admission' then coalesce(${venueZone.capacity}, 0) else (select count(*) from ${venueSeat} where ${venueSeat.venueZoneId} = ${venueZone.id}) end`.mapWith(
          Number,
        ),
      })
      .from(venueZone)
      // The join makes drizzle qualify the columns of the correlated subquery above (single-table selects strip the table name).
      .innerJoin(venue, eq(venue.id, venueZone.venueId))
      .orderBy(venueZone.sortOrder, venueZone.name, venueZone.id),
  ]);

  const byVenue = new Map<string, VenueOption>(venues.map((place) => [place.id, { ...place, zones: [] }]));
  for (const { venueId, ...zone } of zones) byVenue.get(venueId)?.zones.push(zone);

  return { categories, venues: [...byVenue.values()] };
}

/** Organizers an admin can create an event for, by business name. */
export async function listOrganizerOptions(): Promise<OrganizerOption[]> {
  return db
    .select({ id: organizer.id, name: organizer.businessName })
    .from(organizer)
    .orderBy(organizer.businessName, organizer.id);
}

/** The event with everything the edit form needs; `undefined` if it does not exist or `actor` may not see it (same answer for both). */
export async function getEventForEdit(actor: PolicyActor, id: string): Promise<EventForEdit | undefined> {
  if (!z.uuid().safeParse(id).success) return undefined;

  const [row] = await db.select().from(event).where(eq(event.id, id));
  if (!row) return undefined;

  const policyEvent: PolicyEvent = { organizerId: row.organizerId, status: row.status, startsAt: row.startsAt };
  if (!canViewEvent(actor, policyEvent)) return undefined;

  const [facts, zones] = await Promise.all([getEventFacts([id]), getZoneStates(id)]);
  const eventFacts = facts.get(id) ?? { hasSales: false, hasOrders: false };
  const now = new Date();

  return {
    id: row.id,
    status: row.status,
    featured: row.featured,
    values: {
      title: row.title,
      description: row.description ?? "",
      categoryId: row.categoryId,
      venueId: row.venueId,
      date: toLimaDate(row.startsAt),
      time: toLimaTime(row.startsAt),
      coverImageUrl: row.coverImageUrl ?? "",
      zones: zones.map(({ venueZoneId, priceCents, capacity }) => ({
        venueZoneId,
        price: formatCents(priceCents),
        capacity: capacity === null ? "" : String(capacity),
      })),
    },
    zones,
    hasSales: eventFacts.hasSales,
    readOnly: isEventReadOnly(policyEvent, now),
    editable: editableFields(policyEvent, eventFacts, now),
    capabilities: getEventCapabilities(actor, policyEvent, eventFacts, zones, now),
  };
}
