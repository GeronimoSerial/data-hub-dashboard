CREATE TABLE "booklet_assignment_conflict" (
	"cue_anexo" text PRIMARY KEY NOT NULL,
	"rows" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booklet_assignment_conflict_cue_check" CHECK ("booklet_assignment_conflict"."cue_anexo" ~ '^[0-9]{9}$'),
	CONSTRAINT "booklet_assignment_conflict_rows_check" CHECK (jsonb_array_length("booklet_assignment_conflict"."rows") > 1)
);
--> statement-breakpoint
CREATE TABLE "booklet_product" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"level_code" text NOT NULL,
	"grade_code" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booklet_school_assignment" (
	"cue_anexo" text PRIMARY KEY NOT NULL,
	"school_name" text NOT NULL,
	"relationship" text NOT NULL,
	"supervisor_name" text NOT NULL,
	"supervisor_user_id" text NOT NULL,
	"cabecera_cue" text NOT NULL,
	"cabecera_user_id" text NOT NULL,
	"provenance" jsonb NOT NULL,
	"confirmed_by_user_id" text NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "booklet_school_assignment_cue_check" CHECK ("booklet_school_assignment"."cue_anexo" ~ '^[0-9]{9}$'),
	CONSTRAINT "booklet_school_assignment_head_cue_check" CHECK ("booklet_school_assignment"."cabecera_cue" ~ '^[0-9]{9}$'),
	CONSTRAINT "booklet_school_assignment_relationship_check" CHECK ("booklet_school_assignment"."relationship" IN ('cabecera', 'dependiente')),
	CONSTRAINT "booklet_school_assignment_provenance_check" CHECK (jsonb_array_length("booklet_school_assignment"."provenance") > 0)
);
--> statement-breakpoint
ALTER TABLE "booklet_school_assignment" ADD CONSTRAINT "booklet_school_assignment_supervisor_user_id_user_id_fk" FOREIGN KEY ("supervisor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_school_assignment" ADD CONSTRAINT "booklet_school_assignment_cabecera_user_id_user_id_fk" FOREIGN KEY ("cabecera_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_school_assignment" ADD CONSTRAINT "booklet_school_assignment_confirmed_by_user_id_user_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "booklet_product_level_grade_uidx" ON "booklet_product" USING btree ("level_code","grade_code");