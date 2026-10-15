import type { EventStatus } from "@/modules/event/event-list.types";
import type { PolicyActor, PolicyEvent } from "@/modules/event/event-write.types";
import { canViewEvent } from "@/modules/event/event.policy";
import { can } from "@/modules/user/user.permissions";

/** Doors only open for events on sale or already held; never drafts or cancelled ones. */
export const CHECK_IN_EVENT_STATUSES: readonly EventStatus[] = ["published", "finished"];

/**
 * Who may scan at an event's door: its owner, with an approved organizer
 * profile, or an admin/`super_admin` (who need no profile). Pure; the service
 * is the real gate and the UI only hides.
 */
export function canCheckIn(actor: PolicyActor, event: PolicyEvent): boolean {
  if (!CHECK_IN_EVENT_STATUSES.includes(event.status)) return false;
  if (!can(actor.role, "checkin:scan") || !canViewEvent(actor, event)) return false;
  return actor.role !== "organizer" || actor.organizerStatus === "approved";
}
