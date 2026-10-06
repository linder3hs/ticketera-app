import { and, count, eq, gte, ilike, inArray, lte, sql, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { category, event, eventSeat, eventZone, organizer, venue, venueZone } from "@/db/schema";
import { escapeLike } from "@/lib/utils";
import { resolveEventScope, type EventScope } from "@/modules/event/event-list.scope";
import type { EventListQuery, EventsPage, SalesSummary } from "@/modules/event/event-list.types";
import { aggregateZoneSales, toLimaDate, type ZoneSales } from "@/modules/event/event-list.utils";
import { getEventCapabilities } from "@/modules/event/event.policy";
import type { EventFacts, PolicyActor } from "@/modules/event/event-write.types";
import { getEventFacts, getZoneStatesByEvent, zoneCapacity } from "@/modules/event/services/event-facts-service";
import { findOrganizerByUserId, type UserRecord } from "@/modules/user/services/user-service";

type Actor = Pick<UserRecord, "id" | "role">;

function scopeCondition(scope: EventScope): SQL | undefined {
  if (scope.kind === "all") return scope.organizerId ? eq(event.organizerId, scope.organizerId) : undefined;
  return inArray(event.organizerId, db.select({ id: organizer.id }).from(organizer).where(eq(organizer.userId, scope.userId)));
}

/** The event's calendar day in Lima, the same day `toLimaDate` shows. */
const limaDay = sql`(${event.startsAt} at time zone 'America/Lima')::date`;

const NO_FACTS: EventFacts = { hasSales: false, hasOrders: false };

/** The policy actor of a session: role and organizer profile come from the DB, never from client input. */
export async function resolvePolicyActor(actor: Actor): Promise<PolicyActor> {
  const profile = await findOrganizerByUserId(actor.id);
  return { role: actor.role, organizerId: profile?.id ?? null, organizerStatus: profile?.status ?? null };
}

/** Fails closed: a role without access never reaches the DB. */
function requireScope(actor: Actor, organizerId?: string): EventScope {
  const scope = resolveEventScope(actor, organizerId);
  if (!scope) throw new Error("Forbidden");
  return scope;
}

/** Per-zone sales of the events matching `where`: GA zones keep a counter, numbered zones count their `event_seat` rows. */
async function selectZoneSales(where: SQL | undefined): Promise<ZoneSales[]> {
  const seatsSold = sql<number>`(select count(*) from ${eventSeat} where ${eventSeat.eventZoneId} = ${eventZone.id} and ${eventSeat.status} = 'sold')`;
  const isGeneral = eq(venueZone.seatingType, "general_admission");

  return db
    .select({
      eventId: eventZone.eventId,
      priceCents: eventZone.priceCents,
      sold: sql<number>`case when ${isGeneral} then ${eventZone.soldCount} else ${seatsSold} end`.mapWith(Number),
      // Wrapped so `mapWith` does not set the decoder on the shared fragment.
      capacity: sql<number>`${zoneCapacity}`.mapWith(Number),
    })
    .from(eventZone)
    .innerJoin(event, eq(event.id, eventZone.eventId))
    .innerJoin(venueZone, eq(venueZone.id, eventZone.venueZoneId))
    .where(where);
}

/** One page of the events `actor` may see (see `resolveEventScope`), soonest first, with their sales. */
export async function listManagedEvents(actor: Actor, query: EventListQuery): Promise<EventsPage> {
  const scope = requireScope(actor, query.organizerId);
  const where = and(
    scopeCondition(scope),
    query.status ? eq(event.status, query.status) : undefined,
    query.q ? ilike(event.title, `%${escapeLike(query.q)}%`) : undefined,
    query.dateFrom ? gte(limaDay, sql`${query.dateFrom}::date`) : undefined,
    query.dateTo ? lte(limaDay, sql`${query.dateTo}::date`) : undefined,
  );

  const [{ total }] = await db.select({ total: count() }).from(event).where(where);
  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
  const page = Math.min(query.page, pageCount);

  const rows = await db
    .select({ event, venue, category: category.label })
    .from(event)
    .innerJoin(venue, eq(venue.id, event.venueId))
    .innerJoin(category, eq(category.id, event.categoryId))
    .where(where)
    .orderBy(event.startsAt, event.id)
    .limit(query.pageSize)
    .offset((page - 1) * query.pageSize);

  const eventIds = rows.map((row) => row.event.id);
  const [zoneSales, policyActor, facts, zoneStates] = await Promise.all([
    eventIds.length > 0 ? selectZoneSales(inArray(event.id, eventIds)) : [],
    resolvePolicyActor(actor),
    getEventFacts(eventIds),
    getZoneStatesByEvent(eventIds),
  ]);
  const sales = aggregateZoneSales(zoneSales);
  const now = new Date();

  return {
    items: rows.map(({ event: row, venue: place, category: categoryLabel }) => ({
      id: row.id,
      title: row.title,
      category: categoryLabel,
      coverImageUrl: row.coverImageUrl,
      date: toLimaDate(row.startsAt),
      venue: place.name,
      city: place.city,
      status: row.status,
      featured: row.featured,
      currency: row.currency,
      sold: sales.get(row.id)?.sold ?? 0,
      capacity: sales.get(row.id)?.capacity ?? 0,
      revenueCents: sales.get(row.id)?.revenueCents ?? 0,
      capabilities: getEventCapabilities(policyActor, row, facts.get(row.id) ?? NO_FACTS, zoneStates.get(row.id) ?? [], now),
    })),
    total,
    page,
    pageCount,
  };
}

/**
 * Headline numbers for the events `actor` may see. Tickets and revenue come
 * from published and finished events; "published" counts only live ones.
 * ponytail: revenue sums cents across events assuming one currency (PEN);
 * group by currency when a second one shows up.
 */
export async function getSalesSummary(actor: Actor): Promise<SalesSummary> {
  const scope = requireScope(actor);
  const where = scopeCondition(scope);

  const [zones, [{ published }]] = await Promise.all([
    selectZoneSales(and(where, inArray(event.status, ["published", "finished"]))),
    db.select({ published: count() }).from(event).where(and(where, eq(event.status, "published"))),
  ]);

  let sold = 0;
  let revenueCents = 0;
  for (const total of aggregateZoneSales(zones).values()) {
    sold += total.sold;
    revenueCents += total.revenueCents;
  }
  return { sold, revenueCents, published };
}
