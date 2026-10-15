import type { checkInResult, ticketStatus } from "@/db/schema";
import type { EventStatus } from "@/modules/event/event-list.types";
import type { EventActionResult } from "@/modules/event/event-write.types";

export type CheckInResult = (typeof checkInResult.enumValues)[number];
export type TicketStatus = (typeof ticketStatus.enumValues)[number];

/** What a scan can resolve to when the atomic `ok` update touched nothing; `retry` is never stored or shown. */
export type MissResult = Exclude<CheckInResult, "ok"> | "retry";

/** The slice of a ticket (looked up by its code) that decides a miss. */
export interface ScannedTicket {
  id: string;
  eventId: string;
  status: TicketStatus;
  holderName: string;
  checkedInAt: Date | null;
}

/** `checkedIn` = tickets `used`; `sold` = tickets `valid` + `used`. */
export interface CheckInStats {
  checkedIn: number;
  sold: number;
}

/**
 * The answer to one scan. `holderName`/`checkedInAt` are only set for `ok` and
 * `already_used`: a `wrong_event` or `invalid` scan reveals nothing about the ticket.
 */
export interface CheckInOutcome {
  result: CheckInResult;
  holderName: string | null;
  checkedInAt: Date | null;
  stats: CheckInStats;
}

/** The event of a door, for the check-in screen header. `date` is `YYYY-MM-DD` (Lima). */
export interface CheckInEvent {
  id: string;
  title: string;
  status: EventStatus;
  date: string;
}

export type CheckInActionResult = EventActionResult<CheckInOutcome>;
