import Link from "next/link";
import { Ticket } from "lucide-react";

export function Logo() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 rounded-lg text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex size-9 items-center justify-center rounded-[11px] bg-primary text-primary-foreground">
        <Ticket className="size-5" aria-hidden="true" />
      </span>
      <span className="text-xl font-bold tracking-tight">Ticketera</span>
    </Link>
  );
}
