import type { NextRequest } from "next/server";

import { handleConnectWebhook } from "@/modules/payment/services/connect-webhook-service";

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const { status } = await handleConnectWebhook(payload, request.headers.get("stripe-signature"));
  return new Response(status === 200 ? "ok" : "error", { status });
}
