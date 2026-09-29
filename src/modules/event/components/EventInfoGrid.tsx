import { Clock, Music, QrCode, User, type LucideIcon } from "lucide-react";

import type { EventDetail } from "@/modules/event/event.types";

interface EventInfoGridProps {
  event: EventDetail;
}

interface InfoItem {
  icon: LucideIcon;
  label: string;
  value: string;
}

export function EventInfoGrid({ event }: EventInfoGridProps) {
  const items: InfoItem[] = [
    { icon: Clock, label: "Apertura de puertas", value: `${event.doorsOpenAt} h` },
    { icon: Music, label: "Inicio del show", value: `${event.startsAt} h` },
    { icon: User, label: "Edad mínima", value: event.minAge ? `+${event.minAge} años` : "Todas las edades" },
    { icon: QrCode, label: "Ingreso", value: "Entrada digital con QR" },
  ];

  return (
    <dl className="grid grid-cols-2 gap-2.5 lg:gap-4">
      {items.map(({ icon: Icon, label, value }) => (
        <div
          key={label}
          className="flex flex-col gap-2 rounded-2xl border border-border p-3.5 lg:flex-row lg:items-center lg:gap-3.5 lg:rounded-[18px] lg:px-5 lg:py-[18px]"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-primary lg:size-11">
            <Icon className="size-[18px] lg:size-5" aria-hidden="true" />
          </span>
          <div className="flex flex-col gap-0.5">
            <dt className="text-xs text-muted-foreground lg:text-[13px]">{label}</dt>
            <dd className="text-[15px] font-semibold lg:text-base">{value}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}
