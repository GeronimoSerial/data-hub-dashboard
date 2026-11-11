ALTER TABLE "booklet_stock_movement" DROP CONSTRAINT "booklet_stock_movement_kind_check";--> statement-breakpoint
ALTER TABLE "booklet_request" ADD COLUMN "parent_request_id" text;--> statement-breakpoint
ALTER TABLE "booklet_request" ADD COLUMN "root_request_id" text;--> statement-breakpoint
ALTER TABLE "booklet_request" ADD COLUMN "approved_by_user_id" text;--> statement-breakpoint
ALTER TABLE "booklet_request" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booklet_request" ADD COLUMN "rejected_by_user_id" text;--> statement-breakpoint
ALTER TABLE "booklet_request" ADD COLUMN "rejected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booklet_request" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "booklet_stock_movement" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "booklet_request" ADD CONSTRAINT "booklet_request_approved_by_user_id_user_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_request" ADD CONSTRAINT "booklet_request_rejected_by_user_id_user_id_fk" FOREIGN KEY ("rejected_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_request" ADD CONSTRAINT "booklet_request_parent_request_fk" FOREIGN KEY ("parent_request_id") REFERENCES "public"."booklet_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_request" ADD CONSTRAINT "booklet_request_root_request_fk" FOREIGN KEY ("root_request_id") REFERENCES "public"."booklet_request"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_stock_movement" ADD CONSTRAINT "booklet_stock_movement_kind_check" CHECK ("booklet_stock_movement"."movement" IN ('initial', 'replenishment', 'approval'));