import type { TicketStatus } from "@/modules/booking/order.types";

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  valid: "Válida",
  used: "Usada",
  cancelled: "Cancelada",
  refunded: "Reembolsada",
};
