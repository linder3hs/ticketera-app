import { QrCode } from "@/components/ui/QrCode";
import { cn } from "@/lib/utils";
import { TICKET_STATUS_LABELS } from "@/modules/booking/components/ticket-status-labels";
import type { MyTicket } from "@/modules/booking/order.types";

interface TicketQrProps {
  ticket: Pick<MyTicket, "code" | "status">;
  /** Sizes both the QR and the status box (e.g. `size-[168px]`). */
  className?: string;
}

/** The ticket's QR (its `code`) while it is valid; otherwise a same-size box with its status. */
export function TicketQr({ ticket, className }: TicketQrProps) {
  if (ticket.status === "valid") {
    return <QrCode value={ticket.code} label="Código QR de la entrada" className={className} />;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg bg-muted text-center text-base font-semibold text-muted-foreground",
        className,
      )}
    >
      {TICKET_STATUS_LABELS[ticket.status]}
    </div>
  );
}
