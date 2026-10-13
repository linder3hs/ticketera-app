import { and, eq, sql, type SQL } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { db } from "@/db";
import { venue, venueSeat, venueZone } from "@/db/schema";
import { pgErrorCode } from "@/lib/pg-error";
import {
  getVenueFacts,
  getZoneFacts,
  venueHasSales,
  venueIsReferenced,
  zoneIsReferenced,
  zoneMinCapacity,
} from "@/modules/venue/services/venue-facts-service";
import { can } from "@/modules/user/user.permissions";
import {
  VENUE_MESSAGES,
  ZONE_CHANGE_MESSAGES,
  canCreateVenue,
  canDeleteVenue,
  canEditVenue,
  checkZoneChange,
  getEditBlockedReason,
  getZonesBlockedReason,
} from "@/modules/venue/venue.policy";
import type {
  SeatGeneratorInput,
  VenueActionResult,
  VenueActor,
  VenueFacts,
  VenueInput,
  ZoneChangeState,
  ZoneInput,
} from "@/modules/venue/venue.types";
import { buildZoneShape, generateSeats as buildSeatGrid } from "@/modules/venue/venue.utils";

/**
 * Venue writes. `db` is neon-http (no interactive transactions), so: every
 * statement that depends on sales or references carries its guard in the
 * `WHERE`; multi-statement changes go in one `db.batch`. The decision comes
 * from the pure policy with facts read right before writing, and `created_by`
 * comes from the actor, never from the input. See the spec's "Concurrencia".
 * User-facing errors are Spanish and generic; details go to `console.error`.
 */

const MESSAGES = {
  venueNotFound: "No encontramos el recinto.",
  zoneNotFound: "No encontramos la zona.",
  notNumbered: "Solo las zonas numeradas tienen asientos.",
  generic: "No pudimos guardar los cambios. Intenta de nuevo.",
} as const;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/** Logs the detail and answers with a message that exposes nothing; a tripped FK or unique key means something changed in between. */
function failed(context: string, error: unknown): { ok: false; error: string } {
  console.error(context, error);
  const code = pgErrorCode(error);
  if (code === "23503") return fail(VENUE_MESSAGES.zone_in_use);
  if (code === "23505") return fail(VENUE_MESSAGES.sales_changed);
  return fail(MESSAGES.generic);
}

/** Rows a statement affected, whether the driver returned them (`returning`) or only a count. */
function affected(result: unknown): number {
  if (Array.isArray(result)) return result.length;
  return (result as { rowCount?: number | null } | undefined)?.rowCount ?? 0;
}

const isModerator = (actor: VenueActor) => can(actor.role, "venue:moderate");

/** Defence in depth: a non-moderator only ever writes venues they created. */
const ownerGuard = (actor: VenueActor): SQL | undefined => (isModerator(actor) ? undefined : eq(venue.createdBy, actor.id));

async function loadVenue(venueId: string): Promise<{ id: string; createdBy: string | null } | undefined> {
  const [row] = await db.select({ id: venue.id, createdBy: venue.createdBy }).from(venue).where(eq(venue.id, venueId));
  return row;
}

async function loadFacts(venueId: string): Promise<VenueFacts> {
  return (await getVenueFacts([venueId])).get(venueId) ?? { isReferenced: false, hasSales: false };
}

interface StoredZone extends ZoneChangeState {
  id: string;
  venueId: string;
}

async function loadZone(zoneId: string): Promise<StoredZone | undefined> {
  const [row] = await db
    .select({ id: venueZone.id, venueId: venueZone.venueId, seatingType: venueZone.seatingType, capacity: venueZone.capacity })
    .from(venueZone)
    .where(eq(venueZone.id, zoneId));
  return row;
}

interface ZoneWriteContext {
  zone: StoredZone;
  venueId: string;
}

/**
 * Reads the venue and its facts and applies the policy for zone and seat
 * writes: editors only, nothing once there are sales. Returns the error to show.
 */
async function authorizeZoneWrite(actor: VenueActor, venueId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const stored = await loadVenue(venueId);
  if (!stored) return fail(MESSAGES.venueNotFound);
  const reason = getZonesBlockedReason(actor, stored, await loadFacts(venueId));
  return reason ? fail(reason) : { ok: true };
}

/** Same as `authorizeZoneWrite` starting from an existing zone. */
async function loadAuthorizedZone(
  actor: VenueActor,
  zoneId: string,
): Promise<({ ok: true } & ZoneWriteContext) | { ok: false; error: string }> {
  const zone = await loadZone(zoneId);
  if (!zone) return fail(MESSAGES.zoneNotFound);
  const authorized = await authorizeZoneWrite(actor, zone.venueId);
  return authorized.ok ? { ok: true, zone, venueId: zone.venueId } : authorized;
}

/**
 * A guarded zone statement affected no row: say why with fresh facts. `change`
 * is given when the statement could also have been stopped by the type and
 * capacity rules (an update).
 */
async function explainZoneGuard(venueId: string, zoneId: string, change?: { current: ZoneChangeState; next: ZoneChangeState }): Promise<string> {
  const [facts, zoneFacts] = await Promise.all([loadFacts(venueId), getZoneFacts(venueId)]);
  if (facts.hasSales) return VENUE_MESSAGES.has_sales;

  const stored = zoneFacts.get(zoneId);
  if (!stored) return MESSAGES.zoneNotFound;
  if (change) {
    const [error] = checkZoneChange(change.current, change.next, stored);
    return error ? ZONE_CHANGE_MESSAGES[error] : VENUE_MESSAGES.sales_changed;
  }
  return stored.isReferenced ? VENUE_MESSAGES.zone_in_use : VENUE_MESSAGES.sales_changed;
}

/* ---- Venue ---- */

/** Creates a venue owned by the actor. */
export async function createVenue(actor: VenueActor, input: VenueInput): Promise<VenueActionResult<{ id: string }>> {
  if (!canCreateVenue(actor)) return fail(VENUE_MESSAGES.forbidden);

  try {
    const [created] = await db
      .insert(venue)
      .values({ name: input.name, address: input.address, city: input.city, lat: input.lat, lng: input.lng, createdBy: actor.id })
      .returning({ id: venue.id });
    return created ? { ok: true, data: { id: created.id } } : fail(MESSAGES.generic);
  } catch (error) {
    return failed("createVenue", error);
  }
}

/** Basic data only (name, address, city, lat/lng); sales do not matter here. */
export async function updateVenue(actor: VenueActor, venueId: string, input: VenueInput): Promise<VenueActionResult> {
  try {
    const stored = await loadVenue(venueId);
    if (!stored) return fail(MESSAGES.venueNotFound);
    if (!canEditVenue(actor, stored)) return fail(getEditBlockedReason(actor, stored) ?? VENUE_MESSAGES.forbidden);

    const updated = await db
      .update(venue)
      .set({ name: input.name, address: input.address, city: input.city, lat: input.lat, lng: input.lng })
      .where(and(eq(venue.id, venueId), ownerGuard(actor)))
      .returning({ id: venue.id });
    return updated.length === 1 ? { ok: true, data: undefined } : fail(MESSAGES.venueNotFound);
  } catch (error) {
    return failed("updateVenue", error);
  }
}

/** Hard delete (zones and seats cascade). The `NOT EXISTS` in the `WHERE` is the rule; the policy only gives the early answer. */
export async function deleteVenue(actor: VenueActor, venueId: string): Promise<VenueActionResult> {
  try {
    const stored = await loadVenue(venueId);
    if (!stored) return fail(MESSAGES.venueNotFound);

    const facts = await loadFacts(venueId);
    if (!canDeleteVenue(actor, stored, facts)) {
      return fail(getEditBlockedReason(actor, stored) ?? VENUE_MESSAGES.venue_in_use);
    }

    const deleted = await db
      .delete(venue)
      .where(and(eq(venue.id, venueId), ownerGuard(actor), sql`not ${venueIsReferenced(venueId)}`))
      .returning({ id: venue.id });
    return deleted.length === 1 ? { ok: true, data: undefined } : fail(VENUE_MESSAGES.venue_in_use);
  } catch (error) {
    return failed("deleteVenue", error);
  }
}

/* ---- Zones ---- */

const shapeOf = (input: ZoneInput) => (input.shape ? buildZoneShape(input.shape) : null);

export async function createZone(actor: VenueActor, venueId: string, input: ZoneInput): Promise<VenueActionResult<{ id: string }>> {
  try {
    const authorized = await authorizeZoneWrite(actor, venueId);
    if (!authorized.ok) return authorized;

    const zoneId = crypto.randomUUID();
    const shape = shapeOf(input);
    const result = await db.execute(
      sql`insert into ${venueZone} (id, venue_id, name, seating_type, capacity, map_shape, color, sort_order) select ${zoneId}::uuid, ${venue.id}, ${input.name}::text, ${input.seatingType}::seating_type, ${input.capacity}::integer, ${shape === null ? null : JSON.stringify(shape)}::jsonb, ${input.color}::text, ${input.sortOrder}::integer from ${venue} where ${venue.id} = ${venueId} and not ${venueHasSales(venueId)} returning ${venueZone.id}`,
    );
    return affected(result) === 1 ? { ok: true, data: { id: zoneId } } : fail(VENUE_MESSAGES.sales_changed);
  } catch (error) {
    return failed("createZone", error);
  }
}

/**
 * Edits a zone. A new `shape` replaces the stored one; `undefined` keeps it.
 * Numbered to general admission also drops the zone's seats, in the same batch.
 */
export async function updateZone(actor: VenueActor, zoneId: string, input: ZoneInput): Promise<VenueActionResult> {
  try {
    const context = await loadAuthorizedZone(actor, zoneId);
    if (!context.ok) return context;
    const { zone, venueId } = context;

    const zoneFacts = (await getZoneFacts(venueId)).get(zoneId);
    if (!zoneFacts) return fail(MESSAGES.zoneNotFound);
    const next: ZoneChangeState = { seatingType: input.seatingType, capacity: input.capacity };
    const [error] = checkZoneChange(zone, next, zoneFacts);
    if (error) return fail(ZONE_CHANGE_MESSAGES[error]);

    const typeChanged = input.seatingType !== zone.seatingType;
    const update = db
      .update(venueZone)
      .set({
        name: input.name,
        seatingType: input.seatingType,
        capacity: input.capacity,
        color: input.color,
        sortOrder: input.sortOrder,
        ...(input.shape && { mapShape: buildZoneShape(input.shape) }),
      })
      .where(
        and(
          eq(venueZone.id, zoneId),
          eq(venueZone.venueId, venueId),
          sql`not ${venueHasSales(venueId)}`,
          typeChanged ? sql`not ${zoneIsReferenced(zoneId)}` : undefined,
          input.capacity === null ? undefined : sql`${input.capacity}::integer >= ${zoneMinCapacity(zoneId)}`,
        ),
      )
      .returning({ id: venueZone.id });

    // The seat delete only applies if the update did: it requires the zone to be general admission by now.
    const queries: BatchItem<"pg">[] = [update];
    if (typeChanged && zone.seatingType === "numbered") {
      queries.push(
        db
          .delete(venueSeat)
          .where(
            and(
              eq(venueSeat.venueZoneId, zoneId),
              sql`exists (select 1 from ${venueZone} where ${venueZone.id} = ${zoneId} and ${venueZone.seatingType} = 'general_admission')`,
            ),
          ),
      );
    }
    const [updated] = (await db.batch(queries as [BatchItem<"pg">, ...BatchItem<"pg">[]])) as unknown[];

    if (affected(updated) === 1) return { ok: true, data: undefined };
    return fail(await explainZoneGuard(venueId, zoneId, { current: zone, next }));
  } catch (error) {
    return failed("updateZone", error);
  }
}

/** Deletes a zone (its seats cascade) only if no event zone uses it and the venue has no sales. */
export async function deleteZone(actor: VenueActor, zoneId: string): Promise<VenueActionResult> {
  try {
    const context = await loadAuthorizedZone(actor, zoneId);
    if (!context.ok) return context;
    const { venueId } = context;

    const zoneFacts = (await getZoneFacts(venueId)).get(zoneId);
    if (!zoneFacts) return fail(MESSAGES.zoneNotFound);
    if (zoneFacts.isReferenced) return fail(VENUE_MESSAGES.zone_in_use);

    const deleted = await db
      .delete(venueZone)
      .where(
        and(
          eq(venueZone.id, zoneId),
          eq(venueZone.venueId, venueId),
          sql`not ${zoneIsReferenced(zoneId)}`,
          sql`not ${venueHasSales(venueId)}`,
        ),
      )
      .returning({ id: venueZone.id });
    return deleted.length === 1 ? { ok: true, data: undefined } : fail(await explainZoneGuard(venueId, zoneId));
  } catch (error) {
    return failed("deleteZone", error);
  }
}

/* ---- Seats ---- */

/**
 * Replaces every seat of a numbered, unused zone with a fresh grid: one batch
 * of a guarded delete and a guarded insert (the rows travel as one jsonb
 * value). If an event took the zone in between, the `event_seat` FK rejects the
 * delete and the whole batch rolls back (see `failed`).
 */
export async function generateSeats(actor: VenueActor, zoneId: string, input: SeatGeneratorInput): Promise<VenueActionResult<{ count: number }>> {
  try {
    const context = await loadAuthorizedZone(actor, zoneId);
    if (!context.ok) return context;
    const { zone, venueId } = context;

    if (zone.seatingType !== "numbered") return fail(MESSAGES.notNumbered);
    const zoneFacts = (await getZoneFacts(venueId)).get(zoneId);
    if (!zoneFacts) return fail(MESSAGES.zoneNotFound);
    if (zoneFacts.isReferenced) return fail(VENUE_MESSAGES.zone_in_use);

    const seats = buildSeatGrid(input).map(({ rowLabel, seatNumber, x, y }) => ({ row_label: rowLabel, seat_number: seatNumber, x, y }));
    const guard = sql`not ${zoneIsReferenced(zoneId)} and not ${venueHasSales(venueId)}`;

    const queries: BatchItem<"pg">[] = [
      db.delete(venueSeat).where(and(eq(venueSeat.venueZoneId, zoneId), guard)),
      db.execute(
        sql`insert into ${venueSeat} (venue_zone_id, row_label, seat_number, x, y) select ${zoneId}::uuid, s.row_label, s.seat_number, s.x, s.y from jsonb_to_recordset(${JSON.stringify(seats)}::jsonb) as s(row_label text, seat_number integer, x double precision, y double precision) where exists (select 1 from ${venueZone} where ${venueZone.id} = ${zoneId} and ${venueZone.seatingType} = 'numbered') and ${guard}`,
      ),
    ];
    const results = (await db.batch(queries as [BatchItem<"pg">, ...BatchItem<"pg">[]])) as unknown[];

    const count = affected(results[1]);
    if (count === seats.length) return { ok: true, data: { count } };
    return fail(await explainZoneGuard(venueId, zoneId));
  } catch (error) {
    return failed("generateSeats", error);
  }
}
