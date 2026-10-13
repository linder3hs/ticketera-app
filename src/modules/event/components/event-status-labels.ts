import type { EventStatus } from "@/modules/event/event-list.types";

/** Spanish label of each event status, in the order of the `event_status` enum. */
export const EVENT_STATUS_LABEL: Record<EventStatus, string> = {
  draft: "Borrador",
  published: "Publicado",
  cancelled: "Cancelado",
  finished: "Finalizado",
};
