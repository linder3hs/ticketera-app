import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EmailMessage } from "@/modules/email/email.types";
import { sendEmail, sendEmailBatch } from "@/modules/email/services/email-service";

vi.mock("server-only", () => ({}));

const message = (n = 1, overrides: Partial<EmailMessage> = {}): EmailMessage => ({
  to: `buyer${n}@example.com`,
  subject: "Asunto",
  html: "<p>Hola</p>",
  text: "Hola",
  ...overrides,
});

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("RESEND_FROM_EMAIL", "no-reply@ticketera.test");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const request = (call = 0) => {
  const [url, init] = fetchMock.mock.calls[call] as [string, RequestInit];
  return { url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) };
};

describe("sendEmail", () => {
  it("posts the message from the Ticketera sender with the key and idempotency header", async () => {
    await sendEmail(message(1, { attachments: [{ filename: "a.pdf", content: "QQ==" }] }), "order-paid:1");

    const { url, headers, body } = request();
    expect(url).toBe("https://api.resend.com/emails");
    expect(headers.Authorization).toBe("Bearer re_test");
    expect(headers["Idempotency-Key"]).toBe("order-paid:1");
    expect(body).toMatchObject({
      from: "Ticketera <no-reply@ticketera.test>",
      to: ["buyer1@example.com"],
      subject: "Asunto",
      attachments: [{ filename: "a.pdf", content: "QQ==" }],
    });
  });

  it("sends no idempotency header without a key", async () => {
    await sendEmail(message());

    expect(request().headers["Idempotency-Key"]).toBeUndefined();
  });

  it("throws with the status and error name only (the message may echo the address)", async () => {
    const body = { name: "validation_error", message: "You can only send to buyer1@example.com" };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status: 403 }));

    const error = await sendEmail(message()).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Resend 403 validation_error");
  });

  it("counts a 409 on a reused key as already sent", async () => {
    fetchMock.mockResolvedValue(new Response("invalid_idempotent_request", { status: 409 }));

    await expect(sendEmail(message(), "order-paid:1")).resolves.toBeUndefined();
  });

  it("fails clearly when the API key is missing, without calling Resend", async () => {
    vi.stubEnv("RESEND_API_KEY", "");

    await expect(sendEmail(message())).rejects.toThrow("RESEND_API_KEY is not set.");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sendEmailBatch", () => {
  it("splits into requests of 100 with one key per chunk", async () => {
    await sendEmailBatch(Array.from({ length: 150 }, (_, i) => message(i)), "event-cancelled:e1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(request(0).url).toBe("https://api.resend.com/emails/batch");
    expect(request(0).body).toHaveLength(100);
    expect(request(1).body).toHaveLength(50);
    expect(request(0).headers["Idempotency-Key"]).toBe("event-cancelled:e1:0");
    expect(request(1).headers["Idempotency-Key"]).toBe("event-cancelled:e1:1");
  });

  it("rejects attachments, which batches can't carry", async () => {
    await expect(
      sendEmailBatch([message(1, { attachments: [{ filename: "a.pdf", content: "QQ==" }] })]),
    ).rejects.toThrow("attachments");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
