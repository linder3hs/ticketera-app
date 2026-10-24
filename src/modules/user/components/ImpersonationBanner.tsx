import { VenetianMask } from "lucide-react";

import { StopImpersonationButton } from "@/modules/user/components/StopImpersonationButton";
import { getImpersonation } from "@/modules/user/current-user";

/** "Acting as …" bar with the exit button; renders nothing without an active impersonation. */
export async function ImpersonationBanner() {
  const impersonation = await getImpersonation();
  if (!impersonation) return null;

  const { target } = impersonation;

  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 border-b border-amber-200 bg-amber-100 px-4 py-1 text-sm text-amber-950"
    >
      <VenetianMask className="size-5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 truncate">
        Estás viendo como <strong className="font-semibold">{target.fullName ?? target.email}</strong>{" "}
        <span aria-hidden="true">—</span>
      </p>
      <StopImpersonationButton />
    </div>
  );
}
