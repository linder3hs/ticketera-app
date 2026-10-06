import { pgEnum } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", [
  "super_admin",
  "admin",
  "organizer",
  "customer",
]);
export const authProvider = pgEnum("auth_provider", ["google", "email"]);
export const documentType = pgEnum("document_type", ["dni", "ce", "passport"]);
export const organizerStatus = pgEnum("organizer_status", [
  "pending",
  "approved",
  "suspended",
]);
export const stripeOnboardingStatus = pgEnum("stripe_onboarding_status", [
  "not_started",
  "pending",
  "complete",
]);
export const seatingType = pgEnum("seating_type", [
  "numbered",
  "general_admission",
]);
export const eventStatus = pgEnum("event_status", [
  "draft",
  "published",
  "cancelled",
  "finished",
]);
export const eventSeatStatus = pgEnum("event_seat_status", [
  "available",
  "held",
  "sold",
  "blocked",
]);
export const reservationStatus = pgEnum("reservation_status", [
  "active",
  "converted",
  "expired",
  "released",
]);
export const orderStatus = pgEnum("order_status", [
  "pending",
  "paid",
  "failed",
  "cancelled",
  "partially_refunded",
  "refunded",
]);
// ponytail: payment/refund status not in erd.md §2; minimal Stripe-mirroring values
export const paymentStatus = pgEnum("payment_status", [
  "pending",
  "succeeded",
  "failed",
]);
export const refundStatus = pgEnum("refund_status", [
  "pending",
  "succeeded",
  "failed",
]);
export const ticketStatus = pgEnum("ticket_status", [
  "valid",
  "used",
  "cancelled",
  "refunded",
]);
export const checkInResult = pgEnum("check_in_result", [
  "ok",
  "already_used",
  "invalid",
  "wrong_event",
]);
export const refundReason = pgEnum("refund_reason", [
  "customer_request",
  "event_cancelled",
  "admin",
]);
