import type { ReactNode } from "react";

import { PanelShell } from "@/modules/panel/components/PanelShell";
import { requireRole } from "@/modules/user/current-user";
import { ROLE_LABEL } from "@/modules/user/components/role-labels";

export default async function PanelLayout({ children }: { children: ReactNode }) {
  const current = await requireRole("organizer");

  return (
    <PanelShell
      role={current.role}
      user={{ name: current.fullName ?? current.email, email: current.email, roleLabel: ROLE_LABEL[current.role] }}
    >
      {children}
    </PanelShell>
  );
}
