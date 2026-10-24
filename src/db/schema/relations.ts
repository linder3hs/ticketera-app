import { relations } from "drizzle-orm";
import { auditLog } from "./audit";
import { category, event, eventSeat, eventZone } from "./event";
import { organizer, platformSetting, user } from "./identity";
import { orderItem, orders, payment } from "./order";
import { refund, refundTicket } from "./refund";
import { reservation, reservationItem } from "./reservation";
import { checkIn, ticket } from "./ticket";
import { venue, venueSeat, venueZone } from "./venue";

export const userRelations = relations(user, ({ one, many }) => ({
  organizer: one(organizer),
  reservations: many(reservation),
  orders: many(orders),
}));

export const organizerRelations = relations(organizer, ({ one, many }) => ({
  user: one(user, { fields: [organizer.userId], references: [user.id] }),
  events: many(event),
}));

export const platformSettingRelations = relations(platformSetting, ({ one }) => ({
  updatedBy: one(user, {
    fields: [platformSetting.updatedBy],
    references: [user.id],
  }),
}));

export const venueRelations = relations(venue, ({ many }) => ({
  zones: many(venueZone),
  events: many(event),
}));

export const venueZoneRelations = relations(venueZone, ({ one, many }) => ({
  venue: one(venue, { fields: [venueZone.venueId], references: [venue.id] }),
  seats: many(venueSeat),
  eventZones: many(eventZone),
}));

export const venueSeatRelations = relations(venueSeat, ({ one, many }) => ({
  zone: one(venueZone, {
    fields: [venueSeat.venueZoneId],
    references: [venueZone.id],
  }),
  eventSeats: many(eventSeat),
}));

export const categoryRelations = relations(category, ({ many }) => ({
  events: many(event),
}));

export const eventRelations = relations(event, ({ one, many }) => ({
  organizer: one(organizer, {
    fields: [event.organizerId],
    references: [organizer.id],
  }),
  venue: one(venue, { fields: [event.venueId], references: [venue.id] }),
  category: one(category, {
    fields: [event.categoryId],
    references: [category.id],
  }),
  zones: many(eventZone),
}));

export const eventZoneRelations = relations(eventZone, ({ one, many }) => ({
  event: one(event, { fields: [eventZone.eventId], references: [event.id] }),
  venueZone: one(venueZone, {
    fields: [eventZone.venueZoneId],
    references: [venueZone.id],
  }),
  seats: many(eventSeat),
}));

export const eventSeatRelations = relations(eventSeat, ({ one }) => ({
  zone: one(eventZone, {
    fields: [eventSeat.eventZoneId],
    references: [eventZone.id],
  }),
  venueSeat: one(venueSeat, {
    fields: [eventSeat.venueSeatId],
    references: [venueSeat.id],
  }),
}));

export const reservationRelations = relations(reservation, ({ one, many }) => ({
  user: one(user, { fields: [reservation.userId], references: [user.id] }),
  event: one(event, { fields: [reservation.eventId], references: [event.id] }),
  items: many(reservationItem),
}));

export const reservationItemRelations = relations(reservationItem, ({ one }) => ({
  reservation: one(reservation, {
    fields: [reservationItem.reservationId],
    references: [reservation.id],
  }),
  eventZone: one(eventZone, {
    fields: [reservationItem.eventZoneId],
    references: [eventZone.id],
  }),
  eventSeat: one(eventSeat, {
    fields: [reservationItem.eventSeatId],
    references: [eventSeat.id],
  }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(user, { fields: [orders.userId], references: [user.id] }),
  event: one(event, { fields: [orders.eventId], references: [event.id] }),
  reservation: one(reservation, {
    fields: [orders.reservationId],
    references: [reservation.id],
  }),
  items: many(orderItem),
  payment: one(payment),
  refunds: many(refund),
}));

export const orderItemRelations = relations(orderItem, ({ one }) => ({
  order: one(orders, { fields: [orderItem.orderId], references: [orders.id] }),
  eventZone: one(eventZone, {
    fields: [orderItem.eventZoneId],
    references: [eventZone.id],
  }),
  eventSeat: one(eventSeat, {
    fields: [orderItem.eventSeatId],
    references: [eventSeat.id],
  }),
  ticket: one(ticket),
}));

export const paymentRelations = relations(payment, ({ one, many }) => ({
  order: one(orders, { fields: [payment.orderId], references: [orders.id] }),
  refunds: many(refund),
}));

export const ticketRelations = relations(ticket, ({ one, many }) => ({
  orderItem: one(orderItem, {
    fields: [ticket.orderItemId],
    references: [orderItem.id],
  }),
  event: one(event, { fields: [ticket.eventId], references: [event.id] }),
  checkIns: many(checkIn),
  refundTickets: many(refundTicket),
}));

export const checkInRelations = relations(checkIn, ({ one }) => ({
  ticket: one(ticket, { fields: [checkIn.ticketId], references: [ticket.id] }),
  scannedBy: one(user, { fields: [checkIn.scannedBy], references: [user.id] }),
}));

export const refundRelations = relations(refund, ({ one, many }) => ({
  payment: one(payment, {
    fields: [refund.paymentId],
    references: [payment.id],
  }),
  order: one(orders, { fields: [refund.orderId], references: [orders.id] }),
  requestedBy: one(user, {
    fields: [refund.requestedBy],
    references: [user.id],
  }),
  tickets: many(refundTicket),
}));

export const refundTicketRelations = relations(refundTicket, ({ one }) => ({
  refund: one(refund, {
    fields: [refundTicket.refundId],
    references: [refund.id],
  }),
  ticket: one(ticket, {
    fields: [refundTicket.ticketId],
    references: [ticket.id],
  }),
}));

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(user, {
    fields: [auditLog.actorUserId],
    references: [user.id],
    relationName: "audit_actor",
  }),
  onBehalfOf: one(user, {
    fields: [auditLog.onBehalfOfUserId],
    references: [user.id],
    relationName: "audit_on_behalf_of",
  }),
}));
