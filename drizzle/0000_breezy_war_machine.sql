CREATE TYPE "public"."auth_provider" AS ENUM('google', 'email');--> statement-breakpoint
CREATE TYPE "public"."check_in_result" AS ENUM('ok', 'already_used', 'invalid', 'wrong_event');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('dni', 'ce', 'passport');--> statement-breakpoint
CREATE TYPE "public"."event_seat_status" AS ENUM('available', 'held', 'sold', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."event_status" AS ENUM('draft', 'published', 'cancelled', 'finished');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'paid', 'failed', 'cancelled', 'partially_refunded', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."organizer_status" AS ENUM('pending', 'approved', 'suspended');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."refund_reason" AS ENUM('customer_request', 'event_cancelled', 'admin');--> statement-breakpoint
CREATE TYPE "public"."refund_status" AS ENUM('pending', 'succeeded', 'failed');--> statement-breakpoint
CREATE TYPE "public"."reservation_status" AS ENUM('active', 'converted', 'expired', 'released');--> statement-breakpoint
CREATE TYPE "public"."seating_type" AS ENUM('numbered', 'general_admission');--> statement-breakpoint
CREATE TYPE "public"."stripe_onboarding_status" AS ENUM('not_started', 'pending', 'complete');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('valid', 'used', 'cancelled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'admin', 'organizer', 'customer');--> statement-breakpoint
CREATE TABLE "category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"icon" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organizer_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"cover_image_url" text,
	"cover_alt" text,
	"starts_at" timestamp with time zone NOT NULL,
	"doors_open_at" timestamp with time zone,
	"min_age" integer,
	"status" "event_status" DEFAULT 'draft' NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"currency" text DEFAULT 'PEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "event_seat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_zone_id" uuid NOT NULL,
	"venue_seat_id" uuid NOT NULL,
	"status" "event_seat_status" DEFAULT 'available' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_seat_zone_venue_seat_uq" UNIQUE("event_zone_id","venue_seat_id")
);
--> statement-breakpoint
CREATE TABLE "event_zone" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"venue_zone_id" uuid NOT NULL,
	"name" text NOT NULL,
	"price_cents" integer NOT NULL,
	"max_per_order" integer DEFAULT 10 NOT NULL,
	"capacity" integer,
	"sold_count" integer DEFAULT 0 NOT NULL,
	"held_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_zone_event_venue_zone_uq" UNIQUE("event_id","venue_zone_id"),
	CONSTRAINT "event_zone_capacity_check" CHECK ("event_zone"."sold_count" + "event_zone"."held_count" <= "event_zone"."capacity")
);
--> statement-breakpoint
CREATE TABLE "organizer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"business_name" text NOT NULL,
	"tax_id" text NOT NULL,
	"stripe_account_id" text,
	"stripe_onboarding_status" "stripe_onboarding_status" DEFAULT 'not_started' NOT NULL,
	"status" "organizer_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizer_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "platform_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text NOT NULL,
	"full_name" text,
	"avatar_url" text,
	"auth_provider" "auth_provider" NOT NULL,
	"phone" text,
	"document_type" "document_type",
	"document_number" text,
	"role" "user_role" DEFAULT 'customer' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_clerk_id_unique" UNIQUE("clerk_id"),
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "order_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"event_zone_id" uuid NOT NULL,
	"event_seat_id" uuid,
	"unit_price_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"reservation_id" uuid,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"platform_fee_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"buyer_name" text NOT NULL,
	"buyer_email" text NOT NULL,
	"buyer_document_type" "document_type",
	"buyer_document_number" text,
	"buyer_phone" text,
	"terms_accepted_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"stripe_payment_intent_id" text NOT NULL,
	"stripe_charge_id" text,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"amount_cents" integer NOT NULL,
	"application_fee_cents" integer NOT NULL,
	"destination_account_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "payment_stripe_payment_intent_id_unique" UNIQUE("stripe_payment_intent_id")
);
--> statement-breakpoint
CREATE TABLE "stripe_event" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"reason" "refund_reason" NOT NULL,
	"status" "refund_status" DEFAULT 'pending' NOT NULL,
	"stripe_refund_id" text,
	"requested_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refund_stripe_refund_id_unique" UNIQUE("stripe_refund_id")
);
--> statement-breakpoint
CREATE TABLE "refund_ticket" (
	"refund_id" uuid NOT NULL,
	"ticket_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refund_ticket_refund_id_ticket_id_pk" PRIMARY KEY("refund_id","ticket_id")
);
--> statement-breakpoint
CREATE TABLE "reservation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"status" "reservation_status" DEFAULT 'active' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservation_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reservation_id" uuid NOT NULL,
	"event_zone_id" uuid NOT NULL,
	"event_seat_id" uuid,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_item_quantity_check" CHECK ("reservation_item"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "check_in" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"scanned_by" uuid NOT NULL,
	"scanned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"result" "check_in_result" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"holder_name" text NOT NULL,
	"code" text NOT NULL,
	"status" "ticket_status" DEFAULT 'valid' NOT NULL,
	"checked_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_order_item_id_unique" UNIQUE("order_item_id"),
	CONSTRAINT "ticket_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "venue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"google_place_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venue_seat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_zone_id" uuid NOT NULL,
	"row_label" text NOT NULL,
	"seat_number" integer NOT NULL,
	"x" double precision,
	"y" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venue_seat_zone_row_number_uq" UNIQUE("venue_zone_id","row_label","seat_number")
);
--> statement-breakpoint
CREATE TABLE "venue_zone" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"name" text NOT NULL,
	"seating_type" "seating_type" NOT NULL,
	"capacity" integer,
	"map_shape" jsonb,
	"color" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_organizer_id_organizer_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."organizer"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_seat" ADD CONSTRAINT "event_seat_event_zone_id_event_zone_id_fk" FOREIGN KEY ("event_zone_id") REFERENCES "public"."event_zone"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_seat" ADD CONSTRAINT "event_seat_venue_seat_id_venue_seat_id_fk" FOREIGN KEY ("venue_seat_id") REFERENCES "public"."venue_seat"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_zone" ADD CONSTRAINT "event_zone_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_zone" ADD CONSTRAINT "event_zone_venue_zone_id_venue_zone_id_fk" FOREIGN KEY ("venue_zone_id") REFERENCES "public"."venue_zone"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizer" ADD CONSTRAINT "organizer_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_setting" ADD CONSTRAINT "platform_setting_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_event_zone_id_event_zone_id_fk" FOREIGN KEY ("event_zone_id") REFERENCES "public"."event_zone"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_event_seat_id_event_seat_id_fk" FOREIGN KEY ("event_seat_id") REFERENCES "public"."event_seat"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_reservation_id_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservation"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_payment_id_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_ticket" ADD CONSTRAINT "refund_ticket_refund_id_refund_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refund"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_ticket" ADD CONSTRAINT "refund_ticket_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation" ADD CONSTRAINT "reservation_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_item" ADD CONSTRAINT "reservation_item_reservation_id_reservation_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_item" ADD CONSTRAINT "reservation_item_event_zone_id_event_zone_id_fk" FOREIGN KEY ("event_zone_id") REFERENCES "public"."event_zone"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_item" ADD CONSTRAINT "reservation_item_event_seat_id_event_seat_id_fk" FOREIGN KEY ("event_seat_id") REFERENCES "public"."event_seat"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_ticket_id_ticket_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."ticket"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_scanned_by_user_id_fk" FOREIGN KEY ("scanned_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_order_item_id_order_item_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket" ADD CONSTRAINT "ticket_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_seat" ADD CONSTRAINT "venue_seat_venue_zone_id_venue_zone_id_fk" FOREIGN KEY ("venue_zone_id") REFERENCES "public"."venue_zone"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venue_zone" ADD CONSTRAINT "venue_zone_venue_id_venue_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venue"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_status_starts_at_idx" ON "event" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "event_category_id_idx" ON "event" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "event_organizer_id_idx" ON "event" USING btree ("organizer_id");--> statement-breakpoint
CREATE INDEX "event_venue_id_idx" ON "event" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "event_seat_zone_status_idx" ON "event_seat" USING btree ("event_zone_id","status");--> statement-breakpoint
CREATE INDEX "event_seat_venue_seat_id_idx" ON "event_seat" USING btree ("venue_seat_id");--> statement-breakpoint
CREATE INDEX "event_zone_venue_zone_id_idx" ON "event_zone" USING btree ("venue_zone_id");--> statement-breakpoint
CREATE INDEX "order_item_order_id_idx" ON "order_item" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_item_event_zone_id_idx" ON "order_item" USING btree ("event_zone_id");--> statement-breakpoint
CREATE INDEX "order_item_event_seat_id_idx" ON "order_item" USING btree ("event_seat_id");--> statement-breakpoint
CREATE INDEX "orders_user_id_created_at_idx" ON "orders" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_event_id_idx" ON "orders" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "orders_reservation_id_idx" ON "orders" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "refund_payment_id_idx" ON "refund" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "refund_order_id_idx" ON "refund" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "refund_ticket_ticket_id_idx" ON "refund_ticket" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "reservation_status_expires_at_idx" ON "reservation" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "reservation_user_id_idx" ON "reservation" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reservation_event_id_idx" ON "reservation" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "reservation_item_reservation_id_idx" ON "reservation_item" USING btree ("reservation_id");--> statement-breakpoint
CREATE INDEX "reservation_item_event_zone_id_idx" ON "reservation_item" USING btree ("event_zone_id");--> statement-breakpoint
CREATE INDEX "reservation_item_event_seat_id_idx" ON "reservation_item" USING btree ("event_seat_id");--> statement-breakpoint
CREATE INDEX "check_in_ticket_id_idx" ON "check_in" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "check_in_scanned_by_idx" ON "check_in" USING btree ("scanned_by");--> statement-breakpoint
CREATE INDEX "ticket_event_id_status_idx" ON "ticket" USING btree ("event_id","status");--> statement-breakpoint
CREATE INDEX "venue_city_idx" ON "venue" USING btree ("city");--> statement-breakpoint
CREATE INDEX "venue_zone_venue_id_idx" ON "venue_zone" USING btree ("venue_id");