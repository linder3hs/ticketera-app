import type { NextRequest } from "next/server";

import { handlePaymentWebhook } from "@/modules/payment/services/payment-webhook-service";

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const { status } = await handlePaymentWebhook(payload, request.headers.get("stripe-signature"));
  return new Response(status === 200 ? "ok" : "error", { status });
}
