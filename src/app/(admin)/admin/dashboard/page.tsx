import type { Metadata } from "next";

import { AdminDashboard } from "@/modules/admin/components/AdminDashboard";
import { getAdminMetrics } from "@/modules/admin/services/admin-metrics-service";
import { requireRole } from "@/modules/user/current-user";

export const metadata: Metadata = { title: "Dashboard — Ticketera" };

export default async function AdminDashboardPage() {
  const user = await requireRole("admin");
  const metrics = await getAdminMetrics(user);

  return <AdminDashboard metrics={metrics} />;
}
