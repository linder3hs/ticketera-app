"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { stopImpersonationAction } from "@/modules/user/impersonation-actions";

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="outline"
      disabled={pending}
      className="h-11 cursor-pointer rounded-xl border-amber-900/30 bg-transparent px-4 font-semibold text-amber-950 hover:bg-amber-200 hover:text-amber-950"
    >
      {pending ? "Saliendo…" : "Salir"}
    </Button>
  );
}

/** Ends the impersonation; the action redirects back to the users list. A form so it works before hydration. */
export function StopImpersonationButton() {
  return (
    <form action={stopImpersonationAction}>
      <SubmitButton />
    </form>
  );
}
