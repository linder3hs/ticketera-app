"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, Users } from "lucide-react";

import { StatCard } from "@/components/ui/StatCard";
import type { CheckInEvent, CheckInStats } from "@/modules/check-in/check-in.types";
import { INITIAL_SCAN_GATE, normalizeScannedCode, shouldIgnoreScan } from "@/modules/check-in/check-in.utils";
import { CheckInResultCard } from "@/modules/check-in/components/CheckInResultCard";
import { ManualCodeForm } from "@/modules/check-in/components/ManualCodeForm";
import { useCheckIn } from "@/modules/check-in/hooks/use-check-in";
import { formatEventDateParts } from "@/modules/event/event.utils";

// The camera code (and jsqr) only loads in the browser; `ssr: false` is allowed here because this is a Client Component.
const QrScanner = dynamic(() => import("./QrScanner").then((module) => module.QrScanner), {
  ssr: false,
  loading: () => <div className="aspect-square w-full animate-pulse rounded-[20px] bg-muted" aria-hidden="true" />,
});

const CARD_CLASS = "flex flex-col gap-4 rounded-[20px] border border-border bg-card px-4 py-5 lg:gap-5 lg:rounded-3xl lg:p-7";

interface CheckInScreenProps {
  event: CheckInEvent;
  /** Counter as loaded on the server; each answer replaces it. */
  initialStats: CheckInStats;
}

/** Door screen of one event: camera scanner, typed fallback, last result and the "checked in / sold" counter. */
export function CheckInScreen({ event, initialStats }: CheckInScreenProps) {
  const [stats, setStats] = useState(initialStats);
  const checkIn = useCheckIn();
  const gateRef = useRef(INITIAL_SCAN_GATE);
  const { mutate, isPending } = checkIn;

  const submit = useCallback(
    (code: string) => mutate({ eventId: event.id, code }, { onSuccess: (outcome) => setStats(outcome.stats) }),
    [mutate, event.id],
  );

  // Called for every analysed camera frame (`null` = nothing read), which is what lets the gate notice the QR left the frame.
  const handleFrame = useCallback(
    (text: string | null) => {
      const decoded = text === null ? null : normalizeScannedCode(text) || null;
      const { ignore, gate } = shouldIgnoreScan(gateRef.current, decoded, isPending);
      gateRef.current = gate;
      if (!ignore && decoded) submit(decoded);
    },
    [isPending, submit],
  );

  return (
    <div className="flex flex-col gap-6 lg:gap-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/organizer"
          className="flex h-11 w-fit items-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Mis eventos
        </Link>
        <h1 className="text-[28px] leading-tight font-bold tracking-tight lg:text-4xl">Check-in</h1>
        <p className="text-base text-muted-foreground">
          {event.title} · {formatEventDateParts(event.date).long}
        </p>
      </div>

      <dl>
        <StatCard label="Ingresaron / vendidas" value={`${stats.checkedIn} / ${stats.sold}`} icon={Users} />
      </dl>

      <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
        <section aria-label="Escáner de cámara" className={CARD_CLASS}>
          <QrScanner onDecode={handleFrame} />
          <p className="text-sm text-muted-foreground">Apunta la cámara al código QR de la entrada.</p>
        </section>

        <div className="flex flex-col gap-6 lg:gap-8">
          <CheckInResultCard outcome={checkIn.data} error={checkIn.error?.message} pending={isPending} />
          <section aria-label="Ingreso manual" className={CARD_CLASS}>
            <h2 className="text-lg font-semibold">Ingreso manual</h2>
            <ManualCodeForm onSubmit={submit} pending={isPending} />
          </section>
        </div>
      </div>
    </div>
  );
}
