import Link from "next/link";
import { RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";
import { REFUND_STATUS_LABELS } from "@/modules/booking/components/refund-status-labels";
import type { MyOrderRefund } from "@/modules/booking/order.types";
import { describeRefundForOrder } from "@/modules/booking/order.utils";

interface RefundNoticeProps {
  refund: MyOrderRefund;
  /** Currency of the event, for the refunded amount. */
  currency: string;
}

/** Refund state of an order, with a link to the refund policy. */
export function RefundNotice({ refund, currency }: RefundNoticeProps) {
  const isDone = refund.status === "succeeded";

  return (
    <div
      role="status"
      className={cn(
        "flex gap-3 rounded-2xl border px-4 py-3 text-sm",
        isDone ? "border-green-200 bg-green-50 text-green-900" : "border-amber-200 bg-amber-50 text-amber-900",
      )}
    >
      <RotateCcw className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <p className="font-semibold">{REFUND_STATUS_LABELS[refund.status]}</p>
        <p className="leading-relaxed">{describeRefundForOrder(refund, currency)}</p>
        <Link href="/refund-policy" className="w-fit font-medium underline underline-offset-4">
          Ver política de reembolsos
        </Link>
      </div>
    </div>
  );
}
