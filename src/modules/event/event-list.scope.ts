import { can } from "@/modules/user/user.permissions";
import type { Role } from "@/modules/user/user.types";

/** Which events an actor may list: their own, everyone's (optionally one organizer's), or none. */
export type EventScope = { kind: "own"; userId: string } | { kind: "all"; organizerId?: string };

/**
 * Resolved on the server from the session role. `requestedOrganizerId` comes
 * from the client, so only roles that can see everything may use it.
 */
export function resolveEventScope(actor: { id: string; role: Role }, requestedOrganizerId?: string): EventScope | null {
  if (can(actor.role, "report:view-global")) return { kind: "all", organizerId: requestedOrganizerId };
  if (can(actor.role, "event:manage-own")) return { kind: "own", userId: actor.id };
  return null;
}
