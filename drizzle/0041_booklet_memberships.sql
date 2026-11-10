CREATE TABLE "booklet_membership" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"capability" text NOT NULL,
	"granted_by_user_id" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "booklet_membership_capability_check" CHECK ("booklet_membership"."capability" IN ('planning', 'cabecera', 'supervisor'))
);
--> statement-breakpoint
ALTER TABLE "booklet_membership" ADD CONSTRAINT "booklet_membership_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_membership" ADD CONSTRAINT "booklet_membership_granted_by_user_id_user_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booklet_membership_active_user_capability_uidx" ON "booklet_membership" USING btree ("user_id","capability") WHERE "booklet_membership"."revoked_at" IS NULL;