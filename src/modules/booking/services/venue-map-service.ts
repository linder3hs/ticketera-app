import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { eventSeat, eventZone, venueSeat, venueZone } from "@/db/schema";
import type { VenueMap } from "@/modules/booking/booking.types";
import { toVenueMap, type VenueSeatRow, type VenueZoneRow } from "@/modules/booking/venue-map.utils";
import type { Event } from "@/modules/event/event.types";
import { zoneCapacity, zoneOccupancy } from "@/modules/event/services/event-facts-service";

/**
 * Zones and seats of an event, read from the DB. `event` must already be
 * validated and visible in public (the page calls this after
 * `getPublicEventDetail`); the lookup uses its internal `id`, not the slug.
 */
export async function getEventVenueMap(event: Pick<Event, "id" | "currency">): Promise<VenueMap> {
  const [zones, seats] = await Promise.all([selectZones(event.id), selectSeats(event.id)]);
  return toVenueMap(event, zones, seats);
}

/** The event's zones with capacity and occupancy, in `venue_zone.sort_order` (same order as `selectZoneStates`). */
function selectZones(eventId: string): Promise<VenueZoneRow[]> {
  return db
    .select({
      id: eventZone.id,
      name: eventZone.name,
      priceCents: eventZone.priceCents,
      seatingType: venueZone.seatingType,
      color: venueZone.color,
      mapShape: venueZone.mapShape,
      // Wrapped so `mapWith` does not set the decoder on the shared fragments.
      capacity: sql<number>`${zoneCapacity}`.mapWith(Number),
      occupied: sql<number>`${zoneOccupancy}`.mapWith(Number),
    })
    .from(eventZone)
    .innerJoin(venueZone, eq(venueZone.id, eventZone.venueZoneId))
    .where(eq(eventZone.eventId, eventId))
    .orderBy(venueZone.sortOrder, venueZone.name, eventZone.id);
}

/** Every seat of the event's numbered zones; `toVenueMap` groups and sorts them. */
function selectSeats(eventId: string): Promise<VenueSeatRow[]> {
  return db
    .select({
      id: eventSeat.id,
      eventZoneId: eventSeat.eventZoneId,
      rowLabel: venueSeat.rowLabel,
      seatNumber: venueSeat.seatNumber,
      x: venueSeat.x,
      y: venueSeat.y,
      status: eventSeat.status,
    })
    .from(eventSeat)
    .innerJoin(venueSeat, eq(venueSeat.id, eventSeat.venueSeatId))
    .innerJoin(eventZone, eq(eventZone.id, eventSeat.eventZoneId))
    .where(eq(eventZone.eventId, eventId));
}
