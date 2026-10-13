import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { venue, venueSeat, venueZone } from "@/db/schema";
import { getVenueFacts, getZoneFacts } from "@/modules/venue/services/venue-facts-service";
import {
  getEditBlockedReason,
  getVenueCapabilities,
  getVenueOwner,
  getZoneCapabilities,
  getZonesBlockedReason,
  VENUE_MESSAGES,
} from "@/modules/venue/venue.policy";
import type { VenueActor, VenueForEdit, VenueListRow, ZoneForEdit, ZoneSummaryInput } from "@/modules/venue/venue.types";
import { parseStoredShape, summarizeVenue } from "@/modules/venue/venue.utils";

/**
 * Venue reads. Every organizer or above sees every venue; `actor` only decides
 * the owner label and the capabilities. Callers guard the role (`requireRole`).
 */

/** Seats of a `venue_zone` row. */
const seatCountOf = sql<number>`(select count(*) from ${venueSeat} where ${venueSeat.venueZoneId} = ${venueZone.id})`;

/** All venues with their summary, owner label and what the actor may do, by name. */
export async function listVenues(actor: VenueActor): Promise<VenueListRow[]> {
  const [venues, zones] = await Promise.all([
    db
      .select({ id: venue.id, name: venue.name, city: venue.city, createdBy: venue.createdBy })
      .from(venue)
      .orderBy(asc(venue.name), asc(venue.id)),
    db
      .select({
        venueId: venueZone.venueId,
        seatingType: venueZone.seatingType,
        capacity: venueZone.capacity,
        seatCount: sql<number>`${seatCountOf}`.mapWith(Number),
      })
      .from(venueZone),
  ]);
  const facts = await getVenueFacts(venues.map((row) => row.id));

  const zonesByVenue = new Map<string, ZoneSummaryInput[]>();
  for (const { venueId, ...zone } of zones) {
    zonesByVenue.set(venueId, [...(zonesByVenue.get(venueId) ?? []), zone]);
  }

  return venues.map((row) => {
    const venueFacts = facts.get(row.id) ?? { isReferenced: false, hasSales: false };
    const capabilities = getVenueCapabilities(actor, row, venueFacts);
    return {
      id: row.id,
      name: row.name,
      city: row.city,
      owner: getVenueOwner(actor, row),
      capabilities,
      blockedReason: capabilities.edit
        ? capabilities.delete
          ? undefined
          : VENUE_MESSAGES.venue_in_use
        : getEditBlockedReason(actor, row),
      ...summarizeVenue(zonesByVenue.get(row.id) ?? []),
    };
  });
}

/** The venue ready for its edit page; `undefined` when it does not exist or `id` is not a uuid. */
export async function getVenueForEdit(actor: VenueActor, id: string): Promise<VenueForEdit | undefined> {
  if (!z.uuid().safeParse(id).success) return undefined;

  const [row] = await db.select().from(venue).where(eq(venue.id, id));
  if (!row) return undefined;

  const [zoneRows, facts, zoneFacts] = await Promise.all([
    db
      .select({
        id: venueZone.id,
        name: venueZone.name,
        seatingType: venueZone.seatingType,
        capacity: venueZone.capacity,
        color: venueZone.color,
        sortOrder: venueZone.sortOrder,
        mapShape: venueZone.mapShape,
        seatCount: sql<number>`${seatCountOf}`.mapWith(Number),
      })
      .from(venueZone)
      .where(eq(venueZone.venueId, id))
      .orderBy(asc(venueZone.sortOrder), asc(venueZone.name), asc(venueZone.id)),
    getVenueFacts([id]),
    getZoneFacts(id),
  ]);
  const venueFacts = facts.get(id) ?? { isReferenced: false, hasSales: false };

  const zones: ZoneForEdit[] = zoneRows.map(({ mapShape, ...zone }) => {
    const stored = zoneFacts.get(zone.id) ?? { isReferenced: false, minCapacity: 0 };
    return {
      ...zone,
      shape: parseStoredShape(mapShape),
      isReferenced: stored.isReferenced,
      capabilities: getZoneCapabilities(stored),
    };
  });

  return {
    id: row.id,
    values: {
      name: row.name,
      address: row.address,
      city: row.city,
      lat: row.lat === null ? "" : String(row.lat),
      lng: row.lng === null ? "" : String(row.lng),
    },
    owner: getVenueOwner(actor, row),
    facts: venueFacts,
    capabilities: getVenueCapabilities(actor, row, venueFacts),
    editBlockedReason: getEditBlockedReason(actor, row),
    zonesBlockedReason: getZonesBlockedReason(actor, row, venueFacts),
    zones,
  };
}
