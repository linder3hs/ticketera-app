import { describe, expect, it } from "vitest";

import type { MyOrder } from "@/modules/booking/order.types";
import {
  connectStatusEmail,
  eventCancelledEmail,
  impersonationEmail,
  orderPaidEmail,
  organizerStatusEmail,
  paymentFailedEmail,
  refundFinishedEmail,
  refundsPendingEmail,
  roleChangedEmail,
} from "@/modules/email/email-templates";

const APP = "https://ticketera.test";

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
  tickets: [
    { id: "t-1", code: "CODE-1", zoneName: "Platea", seatLabel: "Fila A · 4", holderName: "Ana Pérez", status: "valid" },
    { id: "t-2", code: "CODE-2", zoneName: "General", seatLabel: null, holderName: "Ana Pérez", status: "valid" },
  ],
  ...overrides,
});

const user = { email: "org@example.com", fullName: "Luis" };
const eventOrganizer = { ...user, eventId: "event-1", title: "Rock Fest", slug: "rock-fest" };

describe("orderPaidEmail", () => {
  it("lists every ticket code, the total in the event currency and links to Mis entradas", () => {
    const email = orderPaidEmail(order(), APP);

    expect(email.subject).toBe("Tus entradas para Rock Fest");
    expect(email.text).toContain("Hola Ana Pérez,");
    expect(email.text).toContain("CODE-1");
    expect(email.text).toContain("General · Entrada general — CODE-2");
    expect(email.text).toContain("lunes 19 de octubre · 20:00 h");
    expect(email.text).toMatch(/Total pagado: S\/\s?90\.00/);
    expect(email.html).toContain(`${APP}/my-tickets`);
  });
});

describe("eventCancelledEmail", () => {
  it("announces the refund amount of the order", () => {
    const email = eventCancelledEmail(
      order({ refund: { status: "pending", reason: "event_cancelled", amount: 85 } }),
      APP,
    );

    expect(email.subject).toBe("Evento cancelado: Rock Fest");
    expect(email.text).toMatch(/Monto a reembolsar: S\/\s?85\.00/);
  });
});

describe("refundFinishedEmail", () => {
  it("is null while the refund is pending or missing", () => {
    expect(refundFinishedEmail(order(), APP)).toBeNull();
    expect(refundFinishedEmail(order({ refund: { status: "pending", reason: "event_cancelled", amount: 90 } }), APP)).toBeNull();
  });

  it("confirms a succeeded refund and flags a failed one", () => {
    const done = refundFinishedEmail(order({ refund: { status: "succeeded", reason: "event_cancelled", amount: 90 } }), APP);
    const failed = refundFinishedEmail(order({ refund: { status: "failed", reason: "event_cancelled", amount: 90 } }), APP);

    expect(done?.subject).toBe("Reembolso completado · TK-7H3KQ9XM");
    expect(done?.html).toContain("Reembolso completado");
    expect(failed?.html).toContain("Reembolso pendiente");
    expect(failed?.text).toContain("lo estamos revisando");
  });
});

describe("account and organizer emails", () => {
  it("links the payment retry to the event checkout", () => {
    expect(paymentFailedEmail(order({ status: "pending" }), APP).html).toContain(`${APP}/events/rock-fest/checkout`);
  });

  it("words approval and suspension differently", () => {
    expect(organizerStatusEmail(user, "approved", APP).subject).toBe("Tu cuenta de organizador fue aprobada");
    expect(organizerStatusEmail(user, "suspended", APP).subject).toBe("Tu cuenta de organizador fue suspendida");
  });

  it("names the new role and links to its home", () => {
    const email = roleChangedEmail(user, "organizer", APP);

    expect(email.subject).toBe("Tu rol en Ticketera ahora es Organizador");
    expect(email.html).toContain(`${APP}/organizer`);
  });

  it("tells a complete account from one Stripe asks more data for", () => {
    expect(connectStatusEmail(user, "complete", APP).subject).toBe("Tu cuenta de pagos está lista");
    expect(connectStatusEmail(user, "pending", APP).subject).toBe("Stripe necesita más datos de tu cuenta");
  });

  it("counts the pending refunds and links to the event editor", () => {
    const email = refundsPendingEmail(eventOrganizer, 2, APP);

    expect(email.text).toContain("2 reembolsos del evento Rock Fest");
    expect(email.html).toContain(`${APP}/organizer/events/event-1/edit`);
  });

  it("dates the impersonation in Lima time", () => {
    const email = impersonationEmail(user, new Date("2026-10-26T15:30:00Z"));

    expect(email.text).toContain("26 de octubre de 2026");
    expect(email.text).toContain("10:30");
  });

  it("greets without a name when the user has none", () => {
    expect(roleChangedEmail({ ...user, fullName: null }, "customer", APP).text).toContain("Hola, un administrador");
  });
});
