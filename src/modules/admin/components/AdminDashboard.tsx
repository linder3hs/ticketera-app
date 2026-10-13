import Link from "next/link";
import {
  CalendarCheck,
  CalendarX,
  Crown,
  FilePen,
  Flag,
  HandCoins,
  Hourglass,
  LayoutDashboard,
  Megaphone,
  ShieldCheck,
  Ticket,
  TrendingUp,
  UserCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { StatCard } from "@/components/ui/StatCard";
import { cn } from "@/lib/utils";
import type { AdminMetrics, KpiSection } from "@/modules/admin/admin-metrics.types";
import { formatMetricValue, toKpiSections } from "@/modules/admin/admin-report";
import { ExportButtons } from "@/modules/admin/components/ExportButtons";
import { MonthlyTrendChart } from "@/modules/admin/components/MonthlyTrendChart";

/** Icon of each KPI, by `KpiItem.key` (`Ticket`/`TrendingUp` match the `/organizer` cards). */
const KPI_ICONS: Record<string, LucideIcon> = {
  ticketsSold: Ticket,
  revenueCents: TrendingUp,
  platformFeeCents: HandCoins,
  draft: FilePen,
  published: CalendarCheck,
  cancelled: CalendarX,
  finished: Flag,
  super_admin: Crown,
  admin: ShieldCheck,
  organizer: Megaphone,
  customer: UserRound,
  pendingOrganizers: Hourglass,
};

const SHORTCUTS = [
  {
    href: "/admin/users?role=organizer&status=pending",
    label: "Revisar organizadores pendientes",
    icon: UserCheck,
  },
  { href: "/organizer", label: "Moderar eventos", icon: LayoutDashboard },
] as const;

interface AdminDashboardProps {
  metrics: AdminMetrics;
}

/** One group of KPIs: its heading and a `<dl>` of cards. */
function KpiGroup({ section }: { section: KpiSection }) {
  const titleId = `kpi-${section.id}-title`;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="text-lg font-semibold">
        {section.title}
      </h2>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:gap-5 xl:grid-cols-4">
        {section.items.map((item) => (
          <StatCard
            key={item.key}
            label={item.label}
            value={formatMetricValue(item.value, item.unit)}
            icon={KPI_ICONS[item.key]}
          />
        ))}
      </dl>
    </section>
  );
}

/** Global metrics (computed on the server), monthly trends, exports and moderation shortcuts. */
export function AdminDashboard({ metrics }: AdminDashboardProps) {
  // `toKpiSections` fixes the order: sales first, then events, users and moderation.
  const [sales, ...otherSections] = toKpiSections(metrics);

  return (
    <div className="flex flex-col gap-5 lg:gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1 lg:gap-1.5">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight lg:text-4xl">Dashboard</h1>
          <p className="text-sm text-muted-foreground lg:text-[15px]">
            Ventas, eventos y usuarios de toda la plataforma.
          </p>
        </div>
        <ExportButtons metrics={metrics} />
      </div>

      <KpiGroup section={sales} />

      <section aria-labelledby="trends-title" className="flex flex-col gap-3">
        <h2 id="trends-title" className="text-lg font-semibold">
          Tendencias
        </h2>
        <div className="grid gap-3 lg:grid-cols-2 lg:gap-5">
          <MonthlyTrendChart
            title="Ingresos por mes"
            variant="line"
            unit="cents"
            points={metrics.revenueByMonth}
            emptyMessage="Aún no hay órdenes pagadas. El gráfico aparece con los primeros pagos."
            note="Total cobrado en órdenes pagadas, por mes de pago (hora de Lima)."
          />
          <MonthlyTrendChart
            title="Usuarios nuevos por mes"
            variant="bar"
            unit="count"
            points={metrics.newUsersByMonth}
            emptyMessage="No hay usuarios nuevos en los últimos 6 meses."
          />
        </div>
      </section>

      {otherSections.map((section) => (
        <KpiGroup key={section.id} section={section} />
      ))}

      <nav aria-labelledby="shortcuts-title" className="flex flex-col gap-3">
        <h2 id="shortcuts-title" className="text-lg font-semibold">
          Accesos directos
        </h2>
        <ul className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {SHORTCUTS.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "h-11 w-full gap-2 rounded-xl px-5 text-sm font-semibold sm:w-auto",
                )}
              >
                <Icon className="size-[18px]" aria-hidden="true" />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
