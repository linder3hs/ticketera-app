import type { RefundStatus } from "@/modules/payment/payment.types";

/** What the buyer sees as the headline of a refund. `failed` and `canceled` read the same: the money has not come back yet. */
export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  pending: "Reembolso en proceso",
  succeeded: "Reembolsado",
  failed: "Estamos revisando tu reembolso",
  canceled: "Estamos revisando tu reembolso",
};
