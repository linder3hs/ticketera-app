import type { ReactNode } from "react";

import { requireRole } from "@/modules/user/current-user";

export default async function OrganizerLayout({ children }: { children: ReactNode }) {
  await requireRole("organizer");
  return children;
}
