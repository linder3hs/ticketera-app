import { eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { checkIn, event, ticket } from "@/db/schema";
import { canCheckIn } from "@/modules/check-in/check-in.policy";
import type { CheckInInput } from "@/modules/check-in/check-in.schema";
import type {
  CheckInActionResult,
  CheckInEvent,
  CheckInOutcome,
  CheckInResult,
  CheckInStats,
  ScannedTicket,
} from "@/modules/check-in/check-in.types";
import { classifyMiss } from "@/modules/check-in/check-in.utils";
import { toLimaDate } from "@/modules/event/event-list.utils";
import { resolvePolicyActor } from "@/modules/event/services/event-list-service";
import type { UserRecord } from "@/modules/user/services/user-service";

/**
 * Check-in at an event's door. `db` has no interactive transactions (`db.batch` is one transaction),
 * so the `ok` path is one atomic CTE (the conditional `UPDATE` decides, not a
 * previous read) and the other results are a lookup plus an insert; see the
 * spec's "Concurrencia". User-facing errors are generic Spanish; details go to
 * `console.error`.
 */

type Actor = Pick<UserRecord, "id" | "role">;

const MESSAGES = {
  notFound: "No encontramos el evento.",
  retry: "Intenta de nuevo.",
  generic: "No pudimos procesar el escaneo. Intenta de nuevo.",
} as const;

/** `scanned_code` keeps at most this many characters of an unknown code. */
const SCANNED_CODE_MAX_LENGTH = 64;

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/**
 * The event of the door only if it exists and `actor` may scan there (see
 * `canCheckIn`); absent and forbidden look the same (`undefined`).
 */
export async function getCheckInEvent(actor: Actor, eventId: string): Promise<CheckInEvent | undefined> {
  const [row] = await db
    .select({ id: event.id, title: event.title, organizerId: event.organizerId, status: event.status, startsAt: event.startsAt })
    .from(event)
    .where(eq(event.id, eventId));
  if (!row) return undefined;

  const policyActor = await resolvePolicyActor(actor);
  if (!canCheckIn(policyActor, row)) return undefined;
  return { id: row.id, title: row.title, status: row.status, date: toLimaDate(row.startsAt) };
}

/**
 * Tickets in / sold of an event (`ticket_event_id_status_idx`). No access
 * check: call it after `getCheckInEvent` (or inside `checkInTicket`).
 */
export async function getCheckInStats(eventId: string): Promise<CheckInStats> {
  const [row] = await db
    .select({
      checkedIn: sql<number>`count(*) filter (where ${ticket.status} = 'used')`.mapWith(Number),
      sold: sql<number>`count(*) filter (where ${ticket.status} in ('valid', 'used'))`.mapWith(Number),
    })
    .from(ticket)
    .where(eq(ticket.eventId, eventId));
  return { checkedIn: row?.checkedIn ?? 0, sold: row?.sold ?? 0 };
}

interface UsedTicketRow {
  holder_name: string;
  checked_in_at: string | Date;
}

/** Rows of a raw `db.execute`, whether the driver hands them back as an array or inside `rows`. */
function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return (result as { rows?: T[] } | undefined)?.rows ?? [];
}

/**
 * `ok` path in one statement: the `UPDATE` (event and `status = 'valid'` in the
 * `WHERE`) is the only thing that changes the ticket, and the `check_in` row is
 * written in the same statement, so a ticket is never `used` without its log.
 * `updated_at` is explicit: raw SQL does not fire Drizzle's `$onUpdate`.
 */
async function markUsed(code: string, eventId: string, userId: string): Promise<UsedTicketRow | undefined> {
  const result = await db.execute(sql`
    with used as (
      update ${ticket}
         set status = 'used', checked_in_at = now(), updated_at = now()
       where ${ticket.code} = ${code}::text and ${ticket.eventId} = ${eventId}::uuid and ${ticket.status} = 'valid'
      returning id, holder_name, checked_in_at
    ),
    logged as (
      insert into ${checkIn} (ticket_id, event_id, scanned_by, result)
      select id, ${eventId}::uuid, ${userId}::uuid, 'ok'::check_in_result from used
      returning id
    )
    select holder_name, checked_in_at from used
  `);
  return rowsOf<UsedTicketRow>(result)[0];
}

async function findTicketByCode(code: string): Promise<ScannedTicket | undefined> {
  const [found] = await db
    .select({ id: ticket.id, eventId: ticket.eventId, status: ticket.status, holderName: ticket.holderName, checkedInAt: ticket.checkedInAt })
    .from(ticket)
    .where(eq(ticket.code, code));
  return found;
}

/**
 * Logs a non-`ok` scan. Nothing to roll back (the ticket did not change), so a
 * failure is only logged and the answer, which is already right, still goes out.
 * `scanned_code` is stored only when there is no ticket.
 */
async function logMiss(result: Exclude<CheckInResult, "ok">, found: ScannedTicket | undefined, code: string, eventId: string, userId: string) {
  try {
    await db.insert(checkIn).values({
      ticketId: found?.id ?? null,
      eventId,
      scannedCode: found ? null : code.slice(0, SCANNED_CODE_MAX_LENGTH),
      scannedBy: userId,
      result,
    });
  } catch (error) {
    console.error("checkInTicket: could not record the check-in", error);
  }
}

/**
 * Validates a scanned code at the door of `input.eventId` and answers with the
 * result and the updated counter. Gate first (`canCheckIn` via `getCheckInEvent`):
 * a forbidden actor or an event that is not open never writes anything.
 * `input` is already parsed with `checkInInputSchema` (code normalized).
 */
export async function checkInTicket(actor: Actor, input: CheckInInput): Promise<CheckInActionResult> {
  try {
    const gate = await getCheckInEvent(actor, input.eventId);
    if (!gate) return fail(MESSAGES.notFound);

    const { code, eventId } = input;
    const used = await markUsed(code, eventId, actor.id);

    if (used) {
      const outcome: CheckInOutcome = {
        result: "ok",
        holderName: used.holder_name,
        checkedInAt: new Date(used.checked_in_at),
        stats: await getCheckInStats(eventId),
      };
      return { ok: true, data: outcome };
    }

    const found = await findTicketByCode(code);
    const miss = classifyMiss(found, eventId);
    if (miss === "retry") return fail(MESSAGES.retry);

    await logMiss(miss, found, code, eventId, actor.id);

    const outcome: CheckInOutcome = {
      result: miss,
      holderName: miss === "already_used" ? (found?.holderName ?? null) : null,
      checkedInAt: miss === "already_used" ? (found?.checkedInAt ?? null) : null,
      stats: await getCheckInStats(eventId),
    };
    return { ok: true, data: outcome };
  } catch (error) {
    console.error("checkInTicket", error);
    return fail(MESSAGES.generic);
  }
}
