import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { db } from "@/db";
import { eventSeat, eventZone, reservation, reservationItem, venueSeat, venueZone } from "@/db/schema";
import type { OrderItemSource } from "@/modules/booking/checkout.types";
import type {
  ActiveReservation,
  ReservationItemRow,
  ReserveTicketsResult,
  SeatAvailabilityRow,
  TicketRequest,
  ZoneAvailabilityRow,
} from "@/modules/booking/reservation.types";
import {
  RESERVATION_MESSAGES,
  RESERVATION_MINUTES,
  findUnavailable,
  isUnavailableError,
  toActiveReservation,
  toReservationItems,
} from "@/modules/booking/reservation.utils";
import {
  effectiveSeatStatus,
  liveZoneOccupancy,
  releasableReservation,
  zoneCapacity,
} from "@/modules/event/services/event-facts-service";

/**
 * Temporary holds (see the reservation-hold spec's "Mecanismo de aborto").
 * `db` is neon-http: no interactive transactions, so a hold is one `db.batch`
 * (a single non-interactive transaction) whose guards abort it by raising a
 * Postgres error (division by zero on a count mismatch, or the capacity
 * CHECK); a guard that just affects 0 rows would not roll anything back.
 * `reservation`, `event_seat` and `event_zone` are never aliased here, so the
 * shared live fragments resolve; raw SQL sets `updated_at` by hand.
 */

/**
 * S1, sweep + replace: frees every active reservation of the event that is
 * expired or `userId`'s own (`expired`/`released`), puts their seats back to
 * `available` and lowers `held_count` once per zone. The freed set comes from
 * the `UPDATE … RETURNING`, so a concurrent hold waits on the row lock and
 * skips what this one already freed.
 */
function sweepStatement(userId: string, eventId: string) {
  return db.execute(sql`
    with freed as (
      update ${reservation}
         set status = (case when ${reservation.expiresAt} <= now() then 'expired' else 'released' end)::reservation_status,
             updated_at = now()
       where ${reservation.eventId} = ${eventId}::uuid and ${releasableReservation(userId)}
      returning ${reservation.id}
    ),
    items as (
      select ri.event_zone_id, ri.event_seat_id, ri.quantity
        from ${reservationItem} ri inner join freed on freed.id = ri.reservation_id
    ),
    seats as (
      update ${eventSeat} set status = 'available', updated_at = now()
       where ${eventSeat.id} in (select event_seat_id from items where event_seat_id is not null)
         and ${eventSeat.status} = 'held'
      returning ${eventSeat.id}
    ),
    zones as (
      update ${eventZone} set held_count = ${eventZone.heldCount} - released.quantity, updated_at = now()
        from (select event_zone_id, sum(quantity)::int as quantity
                from items where event_seat_id is null group by event_zone_id) released
       where ${eventZone.id} = released.event_zone_id
      returning ${eventZone.id}
    )
    select count(*)::int as released from freed
  `);
}

/**
 * S2, seat guard: holds every requested seat that is `available` in its
 * requested zone of the event; if fewer than requested were held, `1 / 0`
 * aborts the batch (SQLSTATE 22012). `count(*)` is evaluated at run time, so
 * the division cannot be folded by the planner.
 */
function seatGuardStatement(eventId: string, seats: TicketRequest["seats"]) {
  const pairs = seats.flatMap(({ eventZoneId, seatIds }) =>
    seatIds.map((seatId) => sql`(${seatId}::uuid, ${eventZoneId}::uuid)`),
  );

  return db.execute(sql`
    with held as (
      update ${eventSeat} set status = 'held', updated_at = now()
       where (${eventSeat.id}, ${eventSeat.eventZoneId}) in (${sql.join(pairs, sql`, `)})
         and ${eventSeat.status} = 'available'
         and ${eventSeat.eventZoneId} in (select ${eventZone.id} from ${eventZone} where ${eventZone.eventId} = ${eventId}::uuid)
      returning ${eventSeat.id}
    )
    select 1 / (count(*) = ${pairs.length}::int)::int as ok from held
  `);
}

/**
 * S3, GA guard: raises `held_count` of a GA zone of the event only if it fits
 * (`capacity` NULL counts as 0, not sellable); otherwise `1 / 0` aborts the
 * batch (22012). The capacity CHECK (23514) is the safety net.
 */
function generalAdmissionGuardStatement(
  eventId: string,
  { eventZoneId, quantity }: TicketRequest["generalAdmission"][number],
) {
  return db.execute(sql`
    with held as (
      update ${eventZone} set held_count = ${eventZone.heldCount} + ${quantity}::int, updated_at = now()
       where ${eventZone.id} = ${eventZoneId}::uuid and ${eventZone.eventId} = ${eventId}::uuid
         and ${eventZone.venueZoneId} in (select ${venueZone.id} from ${venueZone} where ${venueZone.seatingType} = 'general_admission')
         and ${eventZone.soldCount} + ${eventZone.heldCount} + ${quantity}::int <= coalesce(${eventZone.capacity}, 0)
      returning ${eventZone.id}
    )
    select 1 / (count(*) = 1)::int as ok from held
  `);
}

/**
 * Holds `request` for `userId` for `RESERVATION_MINUTES`, atomically: sweeps
 * the event's expired reservations and replaces the user's live one in the same
 * transaction, so a failed hold leaves everything (the previous reservation
 * included) as it was. Unavailable tickets are answered with which ones; any
 * other error (deadlock, network) is thrown.
 */
export async function reserveTickets(
  userId: string,
  eventId: string,
  request: TicketRequest,
): Promise<ReserveTicketsResult> {
  // S4. The id is generated here: a batch statement cannot read another one's `RETURNING`.
  const reservationId = crypto.randomUUID();
  const insertReservation = db
    .insert(reservation)
    .values({
      id: reservationId,
      userId,
      eventId,
      expiresAt: sql`now() + make_interval(mins => ${RESERVATION_MINUTES}::int)`,
    })
    .returning({ id: reservation.id, expiresAt: reservation.expiresAt });

  // S1 → S2 (seats) → S3 (one per GA zone) → S4 → S5 (items, after S4 for the FK).
  const statements: BatchItem<"pg">[] = [sweepStatement(userId, eventId)];
  if (request.seats.length > 0) statements.push(seatGuardStatement(eventId, request.seats));
  for (const zone of request.generalAdmission) statements.push(generalAdmissionGuardStatement(eventId, zone));
  const insertIndex = statements.push(insertReservation) - 1;
  statements.push(db.insert(reservationItem).values(toReservationItems(reservationId, request)));

  try {
    const results = (await db.batch(statements as [BatchItem<"pg">, ...BatchItem<"pg">[]])) as unknown[];
    const [created] = results[insertIndex] as Awaited<typeof insertReservation>;
    return { ok: true, data: { reservationId: created.id, expiresAt: created.expiresAt.toISOString() } };
  } catch (error) {
    if (!isUnavailableError(error)) throw error;
    return {
      ok: false,
      error: RESERVATION_MESSAGES.unavailable,
      unavailable: await readUnavailable(userId, eventId, request),
    };
  }
}

/**
 * Informative read after a failed hold (outside the rolled-back transaction):
 * which requested tickets are taken for `userId` now. Uses the live fragments,
 * because the DB still holds what expired reservations retain. Best effort: if
 * the race already resolved, the lists may come back empty.
 */
async function readUnavailable(userId: string, eventId: string, request: TicketRequest) {
  const seatIds = request.seats.flatMap((seat) => seat.seatIds);
  const zoneIds = request.generalAdmission.map((zone) => zone.eventZoneId);

  const [seatRows, zoneRows] = await Promise.all([
    seatIds.length > 0 ? selectSeatAvailability(userId, eventId, seatIds) : [],
    zoneIds.length > 0 ? selectZoneAvailability(userId, eventId, zoneIds) : [],
  ]);

  return findUnavailable(request, seatRows, zoneRows);
}

/** `seatIds` among the event's seats, with whether each is free for `userId`. */
function selectSeatAvailability(userId: string, eventId: string, seatIds: string[]): Promise<SeatAvailabilityRow[]> {
  return db
    .select({
      id: eventSeat.id,
      eventZoneId: eventSeat.eventZoneId,
      free: sql<boolean>`${effectiveSeatStatus(userId)} = 'available'`.mapWith(Boolean),
    })
    .from(eventSeat)
    .innerJoin(eventZone, eq(eventZone.id, eventSeat.eventZoneId))
    .where(and(eq(eventZone.eventId, eventId), inArray(eventSeat.id, seatIds)));
}

/** `zoneIds` among the event's GA zones, with what remains for `userId`; any other zone comes back missing (unavailable). */
function selectZoneAvailability(userId: string, eventId: string, zoneIds: string[]): Promise<ZoneAvailabilityRow[]> {
  return db
    .select({
      id: eventZone.id,
      remaining: sql<number>`${zoneCapacity} - ${liveZoneOccupancy(userId)}`.mapWith(Number),
    })
    .from(eventZone)
    .innerJoin(venueZone, eq(venueZone.id, eventZone.venueZoneId))
    .where(
      and(
        eq(eventZone.eventId, eventId),
        eq(venueZone.seatingType, "general_admission"),
        inArray(eventZone.id, zoneIds),
      ),
    );
}

/** `userId`'s most recent live reservation for the event, as the checkout shows it; `null` when there is none. */
export async function getActiveReservation(userId: string, eventId: string): Promise<ActiveReservation | null> {
  const [active] = await db
    .select({ id: reservation.id, expiresAt: reservation.expiresAt })
    .from(reservation)
    .where(
      and(
        eq(reservation.userId, userId),
        eq(reservation.eventId, eventId),
        eq(reservation.status, "active"),
        gt(reservation.expiresAt, sql`now()`),
      ),
    )
    .orderBy(desc(reservation.createdAt), desc(reservation.id))
    .limit(1);
  if (!active) return null;

  const items: ReservationItemRow[] = await db
    .select({
      eventZoneId: reservationItem.eventZoneId,
      zoneName: eventZone.name,
      priceCents: eventZone.priceCents,
      quantity: reservationItem.quantity,
      eventSeatId: reservationItem.eventSeatId,
      rowLabel: venueSeat.rowLabel,
      seatNumber: venueSeat.seatNumber,
      x: venueSeat.x,
      y: venueSeat.y,
    })
    .from(reservationItem)
    .innerJoin(eventZone, eq(eventZone.id, reservationItem.eventZoneId))
    .innerJoin(venueZone, eq(venueZone.id, eventZone.venueZoneId))
    .leftJoin(eventSeat, eq(eventSeat.id, reservationItem.eventSeatId))
    .leftJoin(venueSeat, eq(venueSeat.id, eventSeat.venueSeatId))
    .where(eq(reservationItem.reservationId, active.id))
    .orderBy(venueZone.sortOrder, venueZone.name, eventZone.id);

  return toActiveReservation(active, items);
}

/** A live reservation with its items priced for the order. */
export interface LiveReservation {
  id: string;
  items: OrderItemSource[];
}

/**
 * `userId`'s most recent live reservation for the event with each item priced
 * by its zone, to create the order from. Same liveness as `getActiveReservation`
 * (`active` and not expired by the DB clock); `null` when there is none.
 */
export async function getLiveReservationForOrder(userId: string, eventId: string): Promise<LiveReservation | null> {
  const [live] = await db
    .select({ id: reservation.id })
    .from(reservation)
    .where(
      and(
        eq(reservation.userId, userId),
        eq(reservation.eventId, eventId),
        eq(reservation.status, "active"),
        gt(reservation.expiresAt, sql`now()`),
      ),
    )
    .orderBy(desc(reservation.createdAt), desc(reservation.id))
    .limit(1);
  if (!live) return null;

  const items: OrderItemSource[] = await db
    .select({
      eventZoneId: reservationItem.eventZoneId,
      eventSeatId: reservationItem.eventSeatId,
      quantity: reservationItem.quantity,
      priceCents: eventZone.priceCents,
    })
    .from(reservationItem)
    .innerJoin(eventZone, eq(eventZone.id, reservationItem.eventZoneId))
    .where(eq(reservationItem.reservationId, live.id));

  return { id: live.id, items };
}
