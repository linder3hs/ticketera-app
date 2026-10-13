DROP INDEX "orders_reservation_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "orders_reservation_id_unique" ON "orders" USING btree ("reservation_id");--> statement-breakpoint
INSERT INTO "platform_setting" ("key", "value") VALUES ('platform_fee_percent', '10'::jsonb) ON CONFLICT DO NOTHING;
