CREATE TABLE "booklet_remito" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"cabecera_cue_anexo" text NOT NULL,
	"status" text NOT NULL,
	"dispatched_by_user_id" text NOT NULL,
	"dispatched_at" timestamp with time zone NOT NULL,
	"cabecera_received_by_user_id" text,
	"cabecera_received_at" timestamp with time zone,
	CONSTRAINT "booklet_remito_status_check" CHECK ("booklet_remito"."status" IN ('dispatched', 'received')),
	CONSTRAINT "booklet_remito_receipt_signature_check" CHECK (("booklet_remito"."status" = 'received' AND "booklet_remito"."cabecera_received_by_user_id" IS NOT NULL AND "booklet_remito"."cabecera_received_at" IS NOT NULL) OR ("booklet_remito"."status" = 'dispatched' AND "booklet_remito"."cabecera_received_by_user_id" IS NULL AND "booklet_remito"."cabecera_received_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "booklet_remito_item" (
	"line_id" text NOT NULL,
	"product_id" text NOT NULL,
	"dispatched_quantity" integer NOT NULL,
	"cabecera_received_quantity" integer,
	"school_received_quantity" integer,
	CONSTRAINT "booklet_remito_item_line_id_product_id_pk" PRIMARY KEY("line_id","product_id"),
	CONSTRAINT "booklet_remito_item_dispatched_check" CHECK ("booklet_remito_item"."dispatched_quantity" > 0),
	CONSTRAINT "booklet_remito_item_cabecera_check" CHECK ("booklet_remito_item"."cabecera_received_quantity" IS NULL OR ("booklet_remito_item"."cabecera_received_quantity" >= 0 AND "booklet_remito_item"."cabecera_received_quantity" <= "booklet_remito_item"."dispatched_quantity")),
	CONSTRAINT "booklet_remito_item_school_check" CHECK ("booklet_remito_item"."school_received_quantity" IS NULL OR ("booklet_remito_item"."cabecera_received_quantity" IS NOT NULL AND "booklet_remito_item"."school_received_quantity" >= 0 AND "booklet_remito_item"."school_received_quantity" <= "booklet_remito_item"."cabecera_received_quantity"))
);
--> statement-breakpoint
CREATE TABLE "booklet_remito_line" (
	"id" text PRIMARY KEY NOT NULL,
	"remito_id" text NOT NULL,
	"recipient_cue_anexo" text NOT NULL,
	"recipient_name" text,
	"status" text NOT NULL,
	"cabecera_shortfall_reason" text,
	"school_received_by_user_id" text,
	"school_received_at" timestamp with time zone,
	"school_shortfall_reason" text,
	CONSTRAINT "booklet_remito_line_cue_check" CHECK ("booklet_remito_line"."recipient_cue_anexo" ~ '^[0-9]{9}$'),
	CONSTRAINT "booklet_remito_line_status_check" CHECK ("booklet_remito_line"."status" IN ('in_transit', 'at_cabecera', 'received', 'closed_empty')),
	CONSTRAINT "booklet_remito_line_school_signature_check" CHECK (("booklet_remito_line"."status" = 'received' AND "booklet_remito_line"."school_received_by_user_id" IS NOT NULL AND "booklet_remito_line"."school_received_at" IS NOT NULL) OR ("booklet_remito_line"."status" <> 'received' AND "booklet_remito_line"."school_received_by_user_id" IS NULL AND "booklet_remito_line"."school_received_at" IS NULL AND "booklet_remito_line"."school_shortfall_reason" IS NULL)),
	CONSTRAINT "booklet_remito_line_cabecera_reason_check" CHECK ("booklet_remito_line"."cabecera_shortfall_reason" IS NULL OR length(trim("booklet_remito_line"."cabecera_shortfall_reason")) > 0),
	CONSTRAINT "booklet_remito_line_school_reason_check" CHECK ("booklet_remito_line"."school_shortfall_reason" IS NULL OR length(trim("booklet_remito_line"."school_shortfall_reason")) > 0)
);
--> statement-breakpoint
CREATE TABLE "booklet_remito_observation" (
	"id" text PRIMARY KEY NOT NULL,
	"remito_id" text NOT NULL,
	"line_id" text,
	"author_user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booklet_remito_observation_body_check" CHECK (length(trim("booklet_remito_observation"."body")) > 0)
);
--> statement-breakpoint
ALTER TABLE "booklet_stock_movement" DROP CONSTRAINT "booklet_stock_movement_request_check";--> statement-breakpoint
ALTER TABLE "booklet_stock_movement" DROP CONSTRAINT "booklet_stock_movement_kind_check";--> statement-breakpoint
ALTER TABLE "booklet_stock_movement" ADD COLUMN "remito_id" text;--> statement-breakpoint
ALTER TABLE "booklet_remito" ADD CONSTRAINT "booklet_remito_campaign_id_booklet_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."booklet_campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_remito" ADD CONSTRAINT "booklet_remito_cabecera_cue_anexo_booklet_school_assignment_cue_anexo_fk" FOREIGN KEY ("cabecera_cue_anexo") REFERENCES "public"."booklet_school_assignment"("cue_anexo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_remito" ADD CONSTRAINT "booklet_remito_dispatched_by_user_id_user_id_fk" FOREIGN KEY ("dispatched_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_remito" ADD CONSTRAINT "booklet_remito_cabecera_received_by_user_id_user_id_fk" FOREIGN KEY ("cabecera_received_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_remito_item" ADD CONSTRAINT "booklet_remito_item_line_id_booklet_remito_line_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."booklet_remito_line"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_remito_item" ADD CONSTRAINT "booklet_remito_item_product_id_booklet_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."booklet_product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_remito_line" ADD CONSTRAINT "booklet_remito_line_remito_id_booklet_remito_id_fk" FOREIGN KEY ("remito_id") REFERENCES "public"."booklet_remito"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_remito_line" ADD CONSTRAINT "booklet_remito_line_school_received_by_user_id_user_id_fk" FOREIGN KEY ("school_received_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_remito_observation" ADD CONSTRAINT "booklet_remito_observation_remito_id_booklet_remito_id_fk" FOREIGN KEY ("remito_id") REFERENCES "public"."booklet_remito"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_remito_observation" ADD CONSTRAINT "booklet_remito_observation_line_id_booklet_remito_line_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."booklet_remito_line"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_remito_observation" ADD CONSTRAINT "booklet_remito_observation_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booklet_remito_cabecera_dispatched_idx" ON "booklet_remito" USING btree ("cabecera_cue_anexo","dispatched_at");--> statement-breakpoint
CREATE INDEX "booklet_remito_campaign_dispatched_idx" ON "booklet_remito" USING btree ("campaign_id","dispatched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "booklet_remito_line_remito_recipient_uidx" ON "booklet_remito_line" USING btree ("remito_id","recipient_cue_anexo");--> statement-breakpoint
CREATE INDEX "booklet_remito_line_recipient_idx" ON "booklet_remito_line" USING btree ("recipient_cue_anexo","status");--> statement-breakpoint
CREATE INDEX "booklet_remito_observation_remito_created_idx" ON "booklet_remito_observation" USING btree ("remito_id","created_at");--> statement-breakpoint
ALTER TABLE "booklet_stock_movement" ADD CONSTRAINT "booklet_stock_movement_remito_id_booklet_remito_id_fk" FOREIGN KEY ("remito_id") REFERENCES "public"."booklet_remito"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_stock_movement" ADD CONSTRAINT "booklet_stock_movement_binding_check" CHECK (("booklet_stock_movement"."movement" = 'approval' AND "booklet_stock_movement"."request_id" IS NOT NULL AND "booklet_stock_movement"."remito_id" IS NULL) OR ("booklet_stock_movement"."movement" = 'dispatch' AND "booklet_stock_movement"."remito_id" IS NOT NULL AND "booklet_stock_movement"."request_id" IS NULL) OR ("booklet_stock_movement"."movement" IN ('initial', 'replenishment') AND "booklet_stock_movement"."request_id" IS NULL AND "booklet_stock_movement"."remito_id" IS NULL));--> statement-breakpoint
ALTER TABLE "booklet_stock_movement" ADD CONSTRAINT "booklet_stock_movement_kind_check" CHECK ("booklet_stock_movement"."movement" IN ('initial', 'replenishment', 'approval', 'dispatch'));