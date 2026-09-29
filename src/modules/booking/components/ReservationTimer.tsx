"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

interface ReservationTimerProps {
  /** Epoch ms when the reservation ends. */
  expiresAt: number;
  onExpire: () => void;
}

function formatRemaining(ms: number) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
}

/** Countdown banner for the ticket hold; calls `onExpire` once at 0. */
export function ReservationTimer({ expiresAt, onExpire }: ReservationTimerProps) {
  const [now, setNow] = useState(() => Date.now());
  const remaining = expiresAt - now;

  useEffect(() => {
    if (remaining <= 0) {
      onExpire();
      return;
    }
    const timer = setTimeout(() => setNow(Date.now()), 1000);
    return () => clearTimeout(timer);
  }, [remaining, onExpire]);

  return (
    <p className="flex items-start gap-2.5 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3.5 text-sm leading-snug text-orange-800 lg:h-14 lg:items-center lg:gap-3 lg:px-5 lg:py-0 lg:text-[15px]">
      <Clock className="mt-px size-[18px] shrink-0 lg:mt-0 lg:size-5" aria-hidden="true" />
      <span>
        Reservamos tus entradas por{" "}
        <strong className="tabular-nums" role="timer" aria-live="off">
          {formatRemaining(remaining)}
        </strong>
        . Completa el pago antes de que se liberen.
      </span>
    </p>
  );
}
