CREATE TABLE "booklet_campaign" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"distribution_enabled" boolean DEFAULT false NOT NULL,
	"overassignment_allowed" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booklet_campaign_status_check" CHECK ("booklet_campaign"."status" IN ('draft', 'active', 'closed'))
);
--> statement-breakpoint
CREATE TABLE "booklet_idempotency" (
	"actor_user_id" text NOT NULL,
	"operation" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload_hash" text NOT NULL,
	"response_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booklet_idempotency_actor_user_id_operation_idempotency_key_pk" PRIMARY KEY("actor_user_id","operation","idempotency_key"),
	CONSTRAINT "booklet_idempotency_key_check" CHECK (length(trim("booklet_idempotency"."idempotency_key")) > 0)
);
--> statement-breakpoint
CREATE TABLE "booklet_product_mapping" (
	"product_id" text PRIMARY KEY NOT NULL,
	"source_level_code" text NOT NULL,
	"source_grade_code" text NOT NULL,
	"confirmed_by_user_id" text NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "booklet_product_mapping_source_level_check" CHECK (length(trim("booklet_product_mapping"."source_level_code")) > 0),
	CONSTRAINT "booklet_product_mapping_source_grade_check" CHECK (length(trim("booklet_product_mapping"."source_grade_code")) > 0)
);
--> statement-breakpoint
CREATE TABLE "booklet_quota" (
	"campaign_id" text NOT NULL,
	"cabecera_cue_anexo" text NOT NULL,
	"product_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"updated_by_user_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booklet_quota_campaign_id_cabecera_cue_anexo_product_id_pk" PRIMARY KEY("campaign_id","cabecera_cue_anexo","product_id"),
	CONSTRAINT "booklet_quota_quantity_check" CHECK ("booklet_quota"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "booklet_request" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"recipient_cue_anexo" text NOT NULL,
	"cabecera_cue_anexo" text NOT NULL,
	"status" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submitted_at" timestamp with time zone,
	CONSTRAINT "booklet_request_status_check" CHECK ("booklet_request"."status" IN ('draft', 'pending', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "booklet_request_line" (
	"request_id" text NOT NULL,
	"product_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"approved_quantity" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "booklet_request_line_request_id_product_id_pk" PRIMARY KEY("request_id","product_id"),
	CONSTRAINT "booklet_request_line_quantity_check" CHECK ("booklet_request_line"."quantity" > 0),
	CONSTRAINT "booklet_request_line_approved_quantity_check" CHECK ("booklet_request_line"."approved_quantity" >= 0 AND "booklet_request_line"."approved_quantity" <= "booklet_request_line"."quantity")
);
--> statement-breakpoint
CREATE TABLE "booklet_stock" (
	"campaign_id" text NOT NULL,
	"product_id" text NOT NULL,
	"quantity" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booklet_stock_campaign_id_product_id_pk" PRIMARY KEY("campaign_id","product_id"),
	CONSTRAINT "booklet_stock_quantity_check" CHECK ("booklet_stock"."quantity" >= 0)
);
--> statement-breakpoint
CREATE TABLE "booklet_stock_movement" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"product_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"movement" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"actor_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booklet_stock_movement_quantity_check" CHECK ("booklet_stock_movement"."quantity" > 0),
	CONSTRAINT "booklet_stock_movement_kind_check" CHECK ("booklet_stock_movement"."movement" IN ('initial', 'replenishment'))
);
--> statement-breakpoint
ALTER TABLE "booklet_idempotency" ADD CONSTRAINT "booklet_idempotency_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_product_mapping" ADD CONSTRAINT "booklet_product_mapping_product_id_booklet_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."booklet_product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_product_mapping" ADD CONSTRAINT "booklet_product_mapping_confirmed_by_user_id_user_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_quota" ADD CONSTRAINT "booklet_quota_campaign_id_booklet_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."booklet_campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_quota" ADD CONSTRAINT "booklet_quota_cabecera_cue_anexo_booklet_school_assignment_cue_anexo_fk" FOREIGN KEY ("cabecera_cue_anexo") REFERENCES "public"."booklet_school_assignment"("cue_anexo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_quota" ADD CONSTRAINT "booklet_quota_product_id_booklet_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."booklet_product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_quota" ADD CONSTRAINT "booklet_quota_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_request" ADD CONSTRAINT "booklet_request_campaign_id_booklet_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."booklet_campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_request" ADD CONSTRAINT "booklet_request_recipient_cue_anexo_booklet_school_assignment_cue_anexo_fk" FOREIGN KEY ("recipient_cue_anexo") REFERENCES "public"."booklet_school_assignment"("cue_anexo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_request" ADD CONSTRAINT "booklet_request_cabecera_cue_anexo_booklet_school_assignment_cue_anexo_fk" FOREIGN KEY ("cabecera_cue_anexo") REFERENCES "public"."booklet_school_assignment"("cue_anexo") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_request" ADD CONSTRAINT "booklet_request_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_request_line" ADD CONSTRAINT "booklet_request_line_request_id_booklet_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."booklet_request"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_request_line" ADD CONSTRAINT "booklet_request_line_product_id_booklet_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."booklet_product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_stock" ADD CONSTRAINT "booklet_stock_campaign_id_booklet_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."booklet_campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_stock" ADD CONSTRAINT "booklet_stock_product_id_booklet_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."booklet_product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_stock_movement" ADD CONSTRAINT "booklet_stock_movement_campaign_id_booklet_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."booklet_campaign"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_stock_movement" ADD CONSTRAINT "booklet_stock_movement_product_id_booklet_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."booklet_product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_stock_movement" ADD CONSTRAINT "booklet_stock_movement_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "booklet_request_campaign_status_created_idx" ON "booklet_request" USING btree ("campaign_id","status","created_at");--> statement-breakpoint
CREATE INDEX "booklet_request_recipient_cabecera_idx" ON "booklet_request" USING btree ("recipient_cue_anexo","cabecera_cue_anexo","created_at");--> statement-breakpoint
CREATE INDEX "booklet_stock_movement_campaign_product_created_idx" ON "booklet_stock_movement" USING btree ("campaign_id","product_id","created_at");