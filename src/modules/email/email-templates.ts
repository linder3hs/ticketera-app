import type { MyOrder } from "@/modules/booking/order.types";
import { describeRefundForOrder } from "@/modules/booking/order.utils";
import { renderEmail } from "@/modules/email/email-layout";
import type { EmailContent, EmailLayout } from "@/modules/email/email.types";
import { formatEventDateParts } from "@/modules/event/event.utils";
import { ROLE_LABEL } from "@/modules/user/components/role-labels";
import type { Role } from "@/modules/user/user.types";

/** Who an account email goes to. */
export interface EmailUser {
  email: string;
  fullName: string | null;
}

/** An event and the organizer user who owns it. */
export interface EventOrganizer extends EmailUser {
  eventId: string;
  title: string;
  slug: string;
}

const BUYER_FOOTER = "Recibiste este correo por tu compra en Ticketera.";
const ACCOUNT_FOOTER = "Recibiste este correo porque tienes una cuenta en Ticketera.";

const ROLE_HOME: Record<Role, string> = {
  super_admin: "/admin/dashboard",
  admin: "/admin/dashboard",
  organizer: "/organizer",
  customer: "/",
};

const ROLE_INTRO: Record<Role, string> = {
  super_admin: "Tienes acceso completo al panel de administración.",
  admin: "Ya tienes acceso al panel de administración.",
  organizer: "Ya puedes crear eventos desde tu panel de organizador.",
  customer: "Puedes comprar entradas y verlas siempre en Mis entradas.",
};

function hello(name: string | null): string {
  return name ? `Hola ${name},` : "Hola,";
}

function money(amount: number, currency: string): string {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency }).format(amount);
}

function build(subject: string, layout: EmailLayout): EmailContent {
  return { subject, ...renderEmail(layout) };
}

/** The grey box of a buyer email: event, date, venue and order code. */
function orderPanel(order: MyOrder): NonNullable<EmailLayout["panel"]> {
  const { event } = order;
  return {
    heading: event.title,
    rows: [
      ["Fecha", `${formatEventDateParts(event.date).long} · ${event.startsAt} h`],
      ["Lugar", `${event.venue}, ${event.city}`],
      ["Pedido", order.code],
    ],
  };
}

const myTickets = (appUrl: string) => ({ label: "Ver mis entradas", url: `${appUrl}/my-tickets` });

export function orderPaidEmail(order: MyOrder, appUrl: string): EmailContent {
  return build(`Tus entradas para ${order.event.title}`, {
    preheader: `Pedido ${order.code} confirmado. Tus entradas van adjuntas.`,
    badge: { label: "Compra confirmada", tone: "success" },
    title: "Tus entradas están listas",
    paragraphs: [
      `${hello(order.buyerName)} tu compra se confirmó. Adjuntamos tus entradas en PDF (una por página, con su código QR) y el evento para tu calendario.`,
      "Presenta el QR de cada entrada en el ingreso. También las tienes siempre en Mis entradas.",
    ],
    panel: orderPanel(order),
    items: order.tickets.map((ticket) => ({
      title: ticket.zoneName,
      subtitle: ticket.seatLabel ?? "Entrada general",
      aside: ticket.code,
    })),
    total: { label: "Total pagado", value: money(order.total, order.currency) },
    cta: myTickets(appUrl),
    footer: BUYER_FOOTER,
  });
}

export function eventCancelledEmail(order: MyOrder, appUrl: string): EmailContent {
  const total = money(order.refund?.amount ?? order.total, order.currency);
  return build(`Evento cancelado: ${order.event.title}`, {
    preheader: `Te devolveremos ${total} a tu forma de pago original.`,
    badge: { label: "Evento cancelado", tone: "danger" },
    title: `${order.event.title} fue cancelado`,
    paragraphs: [
      `${hello(order.buyerName)} lamentamos avisarte que el evento fue cancelado y tus entradas ya no son válidas.`,
      `Te devolveremos ${total} a tu forma de pago original. Te escribiremos cuando el reembolso se complete.`,
    ],
    panel: orderPanel(order),
    total: { label: "Monto a reembolsar", value: total },
    cta: myTickets(appUrl),
    footer: BUYER_FOOTER,
  });
}

/** `null` while the order's last refund is still pending (or it has none): only final states are emailed. */
export function refundFinishedEmail(order: MyOrder, appUrl: string): EmailContent | null {
  const { refund } = order;
  if (!refund || refund.status === "pending") return null;

  const done = refund.status === "succeeded";
  const amount = money(refund.amount, order.currency);
  return build(done ? `Reembolso completado · ${order.code}` : `Tu reembolso sigue en revisión · ${order.code}`, {
    preheader: done ? `Te devolvimos ${amount}.` : "Lo estamos revisando y volveremos a intentarlo.",
    badge: done ? { label: "Reembolso completado", tone: "success" } : { label: "Reembolso pendiente", tone: "warning" },
    title: done ? `Te devolvimos ${amount}` : "Tu reembolso aún no se completó",
    paragraphs: [
      `${hello(order.buyerName)} ${describeRefundForOrder(refund, order.currency)}`,
      ...(done ? ["Tu banco puede tardar unos días en mostrarlo en tu estado de cuenta."] : []),
    ],
    panel: orderPanel(order),
    total: { label: "Monto del reembolso", value: amount },
    cta: myTickets(appUrl),
    footer: BUYER_FOOTER,
  });
}

/** The charge arrived after the hold expired, so it was refunded instead of turned into tickets. */
export function orderAutoRefundedEmail(order: MyOrder, appUrl: string): EmailContent {
  const total = money(order.total, order.currency);
  return build(`No pudimos completar tu compra · ${order.code}`, {
    preheader: `Te devolvimos ${total} a tu forma de pago original.`,
    badge: { label: "Pago devuelto", tone: "warning" },
    title: "No pudimos completar tu compra",
    paragraphs: [
      `${hello(order.buyerName)} recibimos tu pago, pero tu reserva venció antes de confirmarse y las entradas ya no estaban disponibles.`,
      `Te devolvimos ${total} a tu forma de pago original. Tu banco puede tardar unos días en mostrarlo.`,
    ],
    panel: orderPanel(order),
    cta: { label: "Volver al evento", url: `${appUrl}/events/${order.event.slug}` },
    footer: BUYER_FOOTER,
  });
}

export function paymentFailedEmail(order: MyOrder, appUrl: string): EmailContent {
  return build(`Tu pago no se procesó · ${order.code}`, {
    preheader: "Puedes intentarlo de nuevo mientras tu reserva siga vigente.",
    badge: { label: "Pago rechazado", tone: "warning" },
    title: "Tu pago no se procesó",
    paragraphs: [
      `${hello(order.buyerName)} el pago de tu pedido fue rechazado y no se hizo ningún cargo.`,
      "Puedes intentarlo de nuevo con otra tarjeta mientras tu reserva siga vigente.",
    ],
    panel: orderPanel(order),
    total: { label: "Total", value: money(order.total, order.currency) },
    cta: { label: "Reintentar el pago", url: `${appUrl}/events/${order.event.slug}/checkout` },
    footer: BUYER_FOOTER,
  });
}

export function organizerStatusEmail(user: EmailUser, status: "approved" | "suspended", appUrl: string): EmailContent {
  const approved = status === "approved";
  return build(approved ? "Tu cuenta de organizador fue aprobada" : "Tu cuenta de organizador fue suspendida", {
    preheader: approved ? "Ya puedes publicar eventos en Ticketera." : "Por ahora no puedes publicar eventos.",
    badge: approved ? { label: "Cuenta aprobada", tone: "success" } : { label: "Cuenta suspendida", tone: "danger" },
    title: approved ? "Tu cuenta de organizador fue aprobada" : "Tu cuenta de organizador fue suspendida",
    paragraphs: approved
      ? [
          `${hello(user.fullName)} ya puedes publicar eventos en Ticketera.`,
          "Si aún no configuraste tus pagos, complétalos en Ajustes para empezar a vender.",
        ]
      : [
          `${hello(user.fullName)} un administrador suspendió tu cuenta de organizador. Mientras siga suspendida no podrás publicar eventos.`,
          "Si crees que es un error, contacta al equipo de Ticketera.",
        ],
    cta: { label: "Ir a mi panel", url: `${appUrl}/organizer` },
    footer: ACCOUNT_FOOTER,
  });
}

export function roleChangedEmail(user: EmailUser, role: Role, appUrl: string): EmailContent {
  const label = ROLE_LABEL[role];
  return build(`Tu rol en Ticketera ahora es ${label}`, {
    preheader: ROLE_INTRO[role],
    badge: { label: "Cuenta actualizada", tone: "brand" },
    title: `Tu rol ahora es ${label}`,
    paragraphs: [`${hello(user.fullName)} un administrador actualizó tu cuenta.`, ROLE_INTRO[role]],
    cta: { label: "Ir a Ticketera", url: `${appUrl}${ROLE_HOME[role]}` },
    footer: ACCOUNT_FOOTER,
  });
}

/** `complete`: payouts are on; `pending`: Stripe asked for more data on an account that was complete. */
export function connectStatusEmail(user: EmailUser, status: "complete" | "pending", appUrl: string): EmailContent {
  const complete = status === "complete";
  return build(complete ? "Tu cuenta de pagos está lista" : "Stripe necesita más datos de tu cuenta", {
    preheader: complete ? "Ya puedes recibir el dinero de tus ventas." : "Completa los datos para seguir cobrando.",
    badge: complete ? { label: "Pagos activos", tone: "success" } : { label: "Acción requerida", tone: "warning" },
    title: complete ? "Tu cuenta de pagos está lista" : "Stripe necesita más datos",
    paragraphs: complete
      ? [`${hello(user.fullName)} Stripe verificó tu cuenta. Ya puedes recibir el dinero de tus ventas.`]
      : [
          `${hello(user.fullName)} Stripe pidió información adicional para tu cuenta de pagos.`,
          "Mientras no la completes, es posible que no recibas transferencias.",
        ],
    cta: { label: complete ? "Ir a mi panel" : "Completar datos", url: `${appUrl}/organizer/settings` },
    footer: ACCOUNT_FOOTER,
  });
}

export function refundsPendingEmail(event: EventOrganizer, pending: number, appUrl: string): EmailContent {
  const count = pending === 1 ? "1 reembolso" : `${pending} reembolsos`;
  return build(`Reembolsos pendientes: ${event.title}`, {
    preheader: `${count} no se pudieron enviar a Stripe.`,
    badge: { label: "Acción requerida", tone: "warning" },
    title: "Hay reembolsos pendientes",
    paragraphs: [
      `${hello(event.fullName)} ${count} del evento ${event.title} no se pudieron enviar a Stripe.`,
      "Suele pasar cuando la cuenta de pagos no tiene saldo suficiente. Revisa tu saldo en Stripe y reintenta los reembolsos desde el evento.",
    ],
    cta: { label: "Ver el evento", url: `${appUrl}/organizer/events/${event.eventId}/edit` },
    footer: ACCOUNT_FOOTER,
  });
}

export function eventPublishedEmail(event: EventOrganizer, appUrl: string): EmailContent {
  return build(`Tu evento ${event.title} está publicado`, {
    preheader: "Ya está visible y a la venta en Ticketera.",
    badge: { label: "Evento publicado", tone: "success" },
    title: `${event.title} ya está publicado`,
    paragraphs: [`${hello(event.fullName)} un administrador publicó tu evento. Ya está visible y a la venta en Ticketera.`],
    cta: { label: "Ver el evento", url: `${appUrl}/events/${event.slug}` },
    footer: ACCOUNT_FOOTER,
  });
}

export function impersonationEmail(user: EmailUser, at: Date): EmailContent {
  const when = new Intl.DateTimeFormat("es-PE", { dateStyle: "long", timeStyle: "short", timeZone: "America/Lima" }).format(at);
  return build("Un administrador accedió a tu cuenta", {
    preheader: `Sesión de soporte iniciada el ${when}.`,
    badge: { label: "Aviso de seguridad", tone: "brand" },
    title: "Un administrador accedió a tu cuenta",
    paragraphs: [
      `${hello(user.fullName)} el equipo de Ticketera inició una sesión de soporte como tú el ${when} (hora de Lima). El acceso queda registrado.`,
      "Si no esperabas este acceso, contacta al equipo de Ticketera.",
    ],
    footer: ACCOUNT_FOOTER,
  });
}
