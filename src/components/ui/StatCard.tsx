import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  /** Decorative; shown next to the label from `lg` up. */
  icon?: LucideIcon;
  className?: string;
}

/** One KPI tile: a `dt`/`dd` pair, so the parent must wrap the cards in a `<dl>`. */
export function StatCard({ label, value, icon: Icon, className }: StatCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-[20px] border border-border bg-card p-[18px] lg:gap-2 lg:rounded-[22px] lg:p-6",
        className,
      )}
    >
      <dt className="flex items-center gap-2 text-[13px] text-muted-foreground lg:text-sm">
        {Icon && <Icon className="hidden size-4 lg:block" aria-hidden="true" />}
        {label}
      </dt>
      <dd className="text-[22px] font-bold tracking-tight tabular-nums lg:text-[32px]">{value}</dd>
    </div>
  );
}
