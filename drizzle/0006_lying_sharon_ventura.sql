ALTER TABLE "check_in" ALTER COLUMN "ticket_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "check_in" ADD COLUMN "event_id" uuid;--> statement-breakpoint
ALTER TABLE "check_in" ADD COLUMN "scanned_code" text;--> statement-breakpoint
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_in" ADD CONSTRAINT "check_in_ticket_or_scanned_code_check" CHECK ("check_in"."ticket_id" IS NOT NULL OR ("check_in"."event_id" IS NOT NULL AND "check_in"."scanned_code" IS NOT NULL));