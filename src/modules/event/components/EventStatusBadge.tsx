import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { Event } from "@/modules/event/event.types";

interface EventStatusBadgeProps {
  status: Event["status"];
  className?: string;
}

/**
 * Status badge for scarce/unavailable events. `available` renders nothing:
 * it's the default state, so labelling it only adds noise to every card.
 */
export function EventStatusBadge({ status, className }: EventStatusBadgeProps) {
  if (status === "sold-out") {
    return (
      <Badge className={cn("border-transparent bg-foreground text-background", className)}>
        Agotado
      </Badge>
    );
  }

  if (status === "last-tickets") {
    return (
      <Badge className={cn("border-transparent bg-orange-100 text-orange-800", className)}>
        Últimas entradas
      </Badge>
    );
  }

  return null;
}
