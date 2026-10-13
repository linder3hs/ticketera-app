// Read-only aggregates for the admin dashboard. No guard here: only call it from
// `admin-metrics-service.ts`, which checks `report:view-global` before any query.
// The monthly series group every month (no lower date bound) so Postgres' `now()`
// never disagrees with the JS `now` that picks the window; the service drops the rest.
// ponytail: bound the monthly queries by date (computed from the same `now`) once `orders` and `user` grow.
import { and, count, eq, isNotNull, isNull, sql, type AnyColumn, type SQL } from "drizzle-orm";

import { db } from "@/db";
import { event, orders, organizer, user } from "@/db/schema";
import type { AggregateRow, MonthKey } from "@/modules/admin/admin-metrics.types";
import type { EventStatus } from "@/modules/event/event-list.types";
import type { Role } from "@/modules/user/user.types";

/** `YYYY-MM` of `column` in Lima, the same `at time zone` criterion as `limaDay` in `event-list-service.ts`. */
function limaMonth(column: AnyColumn): SQL<MonthKey> {
  return sql<MonthKey>`to_char(date_trunc('month', ${column} at time zone 'America/Lima'), 'YYYY-MM')`;
}

/** Platform fee snapshotted on paid orders, in cents (`sum` is `bigint` and `NULL` with no rows). */
export async function getPaidPlatformFeeCents(): Promise<number> {
  const [{ value }] = await db
    .select({ value: sql<number>`coalesce(sum(${orders.platformFeeCents}), 0)`.mapWith(Number) })
    .from(orders)
    .where(eq(orders.status, "paid"));
  return value;
}

export async function countEventsByStatus(): Promise<AggregateRow<EventStatus>[]> {
  return db.select({ key: event.status, value: count() }).from(event).groupBy(event.status);
}

/** Users not soft-deleted, per role. */
export async function countActiveUsersByRole(): Promise<AggregateRow<Role>[]> {
  return db.select({ key: user.role, value: count() }).from(user).where(isNull(user.deletedAt)).groupBy(user.role);
}

/** Same filter as `listUsersPage` with `role=organizer&status=pending`, so the KPI matches that list's total. */
export async function countPendingOrganizers(): Promise<number> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(organizer)
    .innerJoin(user, eq(user.id, organizer.userId))
    .where(and(eq(organizer.status, "pending"), eq(user.role, "organizer"), isNull(user.deletedAt)));
  return value;
}

/** `total_cents` of paid orders per Lima month of `paid_at`; paid orders without `paid_at` have no month. */
export async function sumPaidRevenueByMonth(): Promise<AggregateRow<MonthKey>[]> {
  const month = limaMonth(orders.paidAt);
  return db
    .select({ key: month, value: sql<number>`coalesce(sum(${orders.totalCents}), 0)`.mapWith(Number) })
    .from(orders)
    .where(and(eq(orders.status, "paid"), isNotNull(orders.paidAt)))
    .groupBy(month);
}

/** Users not soft-deleted per Lima month of `created_at`. */
export async function countNewUsersByMonth(): Promise<AggregateRow<MonthKey>[]> {
  const month = limaMonth(user.createdAt);
  return db.select({ key: month, value: count() }).from(user).where(isNull(user.deletedAt)).groupBy(month);
}
