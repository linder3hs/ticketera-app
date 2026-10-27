import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MyOrder } from "@/modules/booking/order.types";
import { findOrderById } from "@/modules/booking/services/order-service";
import { buildTicketsPdf } from "@/modules/booking/ticket-export";
import {
  findEventOrganizer,
  findOrderIdByPaymentIntent,
  listCancelledOrderIds,
} from "@/modules/email/services/email-data-service";
import { sendEmail, sendEmailBatch } from "@/modules/email/services/email-service";
import {
  notifyEventCancelled,
  notifyEventPublished,
  notifyOrderPaid,
  notifyOrganizerStatus,
  notifyPaymentFailed,
} from "@/modules/email/services/notification-service";

vi.mock("@/modules/booking/services/order-service", () => ({ findOrderById: vi.fn() }));
vi.mock("@/modules/booking/ticket-export", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/modules/booking/ticket-export")>()),
  buildTicketsPdf: vi.fn(),
}));
vi.mock("@/modules/email/services/email-data-service", () => ({
  findEventOrganizer: vi.fn(),
  findOrderIdByPaymentIntent: vi.fn(),
  listCancelledOrderIds: vi.fn(),
}));
vi.mock("@/modules/email/services/email-service", () => ({ sendEmail: vi.fn(), sendEmailBatch: vi.fn() }));

const order = (overrides: Partial<MyOrder> = {}): MyOrder => ({
  id: "order-1",
  code: "TK-7H3KQ9XM",
  status: "paid",
  total: 90,
  currency: "PEN",
  buyerName: "Ana Pérez",
  buyerEmail: "ana@example.com",
  event: {
    id: "event-1",
    slug: "rock-fest",
    title: "Rock Fest",
    category: "Música",
    imageUrl: "",
    imageAlt: "Rock Fest",
    date: "2026-10-19",
    startsAt: "20:00",
    venue: "Estadio Nacional",
    address: "Av. José Díaz s/n",
    city: "Lima",
    currency: "PEN",
  },
  refund: null,
  tickets: [{ id: "t-1", code: "CODE-1", zoneName: "Platea", seatLabel: null, holderName: "Ana Pérez", status: "valid" }],
  ...overrides,
});

const loggedText = () => JSON.stringify(vi.mocked(console.error).mock.calls);

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("APP_URL", "https://ticketera.test");
});

describe("notifyOrderPaid", () => {
  it("emails the buyer with the tickets PDF and the calendar file, keyed by order", async () => {
    vi.mocked(findOrderById).mockResolvedValue(order());
    vi.mocked(buildTicketsPdf).mockResolvedValue(new TextEncoder().encode("%PDF").buffer as ArrayBuffer);

    await notifyOrderPaid("order-1");

    const [message, key] = vi.mocked(sendEmail).mock.calls[0];
    expect(key).toBe("order-paid:order-1");
    expect(message.to).toBe("ana@example.com");
    expect(message.attachments?.map((a) => a.filename)).toEqual(["entradas-TK-7H3KQ9XM.pdf", "rock-fest.ics"]);
    expect(Buffer.from(message.attachments![0].content, "base64").toString()).toBe("%PDF");
  });

  it("never throws: a failed send is logged by id, without the address", async () => {
    vi.mocked(findOrderById).mockResolvedValue(order());
    vi.mocked(sendEmail).mockRejectedValue(new Error("Resend 500"));

    await expect(notifyOrderPaid("order-1")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("[email] not sent", "order-paid", "order-1", "Resend 500");
    expect(loggedText()).not.toContain("ana@example.com");
  });

  it("never throws when the lookup fails", async () => {
    vi.mocked(findOrderById).mockRejectedValue(new Error("db down"));

    await expect(notifyOrderPaid("order-1")).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("notifyEventCancelled", () => {
  it("sends one batch with an email per refunded order", async () => {
    vi.mocked(listCancelledOrderIds).mockResolvedValue(["order-1", "order-2"]);
    vi.mocked(findOrderById).mockImplementation(async (id) => order({ id, buyerEmail: `${id}@example.com` }));

    await notifyEventCancelled("event-1");

    const [messages, key] = vi.mocked(sendEmailBatch).mock.calls[0];
    expect(messages.map((m) => m.to)).toEqual(["order-1@example.com", "order-2@example.com"]);
    expect(key).toBe("event-cancelled:event-1");
  });

  it("sends nothing when no order was refunded", async () => {
    vi.mocked(listCancelledOrderIds).mockResolvedValue([]);

    await notifyEventCancelled("event-1");

    expect(sendEmailBatch).not.toHaveBeenCalled();
  });
});

describe("notifyPaymentFailed", () => {
  it("emails while the order is still pending", async () => {
    vi.mocked(findOrderIdByPaymentIntent).mockResolvedValue("order-1");
    vi.mocked(findOrderById).mockResolvedValue(order({ status: "pending" }));

    await notifyPaymentFailed("pi_1");

    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "ana@example.com" }), "payment-failed:order-1");
  });

  it("stays quiet once the order is no longer pending or is unknown", async () => {
    vi.mocked(findOrderIdByPaymentIntent).mockResolvedValue("order-1");
    vi.mocked(findOrderById).mockResolvedValue(order({ status: "paid" }));
    await notifyPaymentFailed("pi_1");

    vi.mocked(findOrderIdByPaymentIntent).mockResolvedValue(null);
    await notifyPaymentFailed("pi_2");

    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe("account notifications", () => {
  const user = { id: "user-1", email: "org@example.com", fullName: "Luis" };

  it("emails approval and suspension but never pending", async () => {
    await notifyOrganizerStatus(user, "approved");
    await notifyOrganizerStatus(user, "pending");

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0].to).toBe("org@example.com");
  });

  it("emails the organizer of a published event and skips an unknown event", async () => {
    vi.mocked(findEventOrganizer).mockResolvedValueOnce({ ...user, eventId: "event-1", title: "Rock Fest", slug: "rock-fest" });
    await notifyEventPublished("event-1");
    vi.mocked(findEventOrganizer).mockResolvedValueOnce(null);
    await notifyEventPublished("event-x");

    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
