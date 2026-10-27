import "server-only";

import { requireEnv } from "@/lib/env";
import type { EmailMessage } from "@/modules/email/email.types";

const RESEND_API = "https://api.resend.com";
/** Resend's limit per batch request. */
const BATCH_SIZE = 100;
const TIMEOUT_MS = 10_000;

function toPayload(message: EmailMessage) {
  return {
    from: `Ticketera <${requireEnv("RESEND_FROM_EMAIL")}>`,
    to: [message.to],
    subject: message.subject,
    html: message.html,
    text: message.text,
    attachments: message.attachments,
  };
}

/**
 * POSTs to Resend; throws on a non-2xx with the status and Resend's error name. A key already used in the last 24 h
 * answers 409 (whether or not the body changed): that email went out already, so it counts as sent.
 */
async function post(path: string, body: unknown, idempotencyKey?: string): Promise<void> {
  const response = await fetch(`${RESEND_API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("RESEND_API_KEY")}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 409 && idempotencyKey) return;
  if (!response.ok) {
    // Only the error name: Resend's message can echo the recipient's address, and logs carry no personal data.
    const detail = (await response.json().catch(() => null)) as { name?: string } | null;
    throw new Error(`Resend ${response.status}${detail?.name ? ` ${detail.name}` : ""}`);
  }
}

/** Sends one email through Resend. Pass `idempotencyKey` when the caller may run again (webhook retries). */
export async function sendEmail(message: EmailMessage, idempotencyKey?: string): Promise<void> {
  await post("/emails", toPayload(message), idempotencyKey);
}

/**
 * Sends many emails in chunks of 100 (one request each, so the rate limit isn't hit). Batches can't carry
 * attachments. The key gets the chunk index appended.
 */
export async function sendEmailBatch(messages: EmailMessage[], idempotencyKey?: string): Promise<void> {
  for (let start = 0; start < messages.length; start += BATCH_SIZE) {
    const chunk = messages.slice(start, start + BATCH_SIZE);
    if (chunk.some((message) => message.attachments?.length)) throw new Error("Batch emails can't have attachments.");
    await post("/emails/batch", chunk.map(toPayload), idempotencyKey && `${idempotencyKey}:${start / BATCH_SIZE}`);
  }
}
