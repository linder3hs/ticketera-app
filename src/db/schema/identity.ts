import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns";
import {
  authProvider,
  documentType,
  organizerStatus,
  stripeOnboardingStatus,
  userRole,
} from "./enums";

export const user = pgTable("user", {
  id,
  clerkId: text("clerk_id").notNull().unique(),
  email: text("email").notNull().unique(),
  fullName: text("full_name"),
  avatarUrl: text("avatar_url"),
  authProvider: authProvider("auth_provider").notNull(),
  phone: text("phone"),
  documentType: documentType("document_type"),
  documentNumber: text("document_number"),
  role: userRole("role").notNull().default("customer"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  ...timestamps,
});

export const organizer = pgTable("organizer", {
  id,
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => user.id),
  businessName: text("business_name").notNull(),
  taxId: text("tax_id"), // completed during organizer onboarding
  stripeAccountId: text("stripe_account_id"),
  stripeOnboardingStatus: stripeOnboardingStatus("stripe_onboarding_status")
    .notNull()
    .default("not_started"),
  status: organizerStatus("status").notNull().default("pending"),
  ...timestamps,
});

export const platformSetting = pgTable("platform_setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => user.id),
  ...timestamps,
});
