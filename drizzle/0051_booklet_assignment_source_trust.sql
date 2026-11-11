CREATE TABLE "booklet_assignment_source_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"source_hash" text NOT NULL,
	"preview_hash" text NOT NULL,
	"source_rows" jsonb NOT NULL,
	"preview" jsonb NOT NULL,
	"status" text DEFAULT 'staged' NOT NULL,
	"staged_by_user_id" text NOT NULL,
	"staged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_by_user_id" text,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "booklet_assignment_source_revision_preview_hash_unique" UNIQUE("preview_hash"),
	CONSTRAINT "booklet_assignment_source_hash_check" CHECK ("booklet_assignment_source_revision"."source_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "booklet_assignment_preview_hash_check" CHECK ("booklet_assignment_source_revision"."preview_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "booklet_assignment_source_status_check" CHECK ("booklet_assignment_source_revision"."status" IN ('staged', 'confirmed')),
	CONSTRAINT "booklet_assignment_source_confirmation_check" CHECK (("booklet_assignment_source_revision"."status" = 'staged' AND "booklet_assignment_source_revision"."confirmed_by_user_id" IS NULL AND "booklet_assignment_source_revision"."confirmed_at" IS NULL) OR ("booklet_assignment_source_revision"."status" = 'confirmed' AND "booklet_assignment_source_revision"."confirmed_by_user_id" IS NOT NULL AND "booklet_assignment_source_revision"."confirmed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "booklet_school_assignment" ADD COLUMN "source_revision_id" text;--> statement-breakpoint
ALTER TABLE "booklet_school_assignment" ADD COLUMN "source_row_hash" text;--> statement-breakpoint
ALTER TABLE "booklet_assignment_source_revision" ADD CONSTRAINT "booklet_assignment_source_revision_staged_by_user_id_user_id_fk" FOREIGN KEY ("staged_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_assignment_source_revision" ADD CONSTRAINT "booklet_assignment_source_revision_confirmed_by_user_id_user_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_school_assignment" ADD CONSTRAINT "booklet_school_assignment_source_revision_id_booklet_assignment_source_revision_id_fk" FOREIGN KEY ("source_revision_id") REFERENCES "public"."booklet_assignment_source_revision"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booklet_school_assignment" ADD CONSTRAINT "booklet_school_assignment_source_hash_check" CHECK ("booklet_school_assignment"."source_row_hash" IS NULL OR "booklet_school_assignment"."source_row_hash" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
CREATE FUNCTION public.booklet_guard_assignment_source_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'staged' OR NEW.confirmed_by_user_id IS NOT NULL OR NEW.confirmed_at IS NOT NULL THEN
      RAISE EXCEPTION 'assignment source revision must be staged before confirmation' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status = 'confirmed'
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.source_id IS DISTINCT FROM OLD.source_id
    OR NEW.source_hash IS DISTINCT FROM OLD.source_hash
    OR NEW.preview_hash IS DISTINCT FROM OLD.preview_hash
    OR NEW.source_rows IS DISTINCT FROM OLD.source_rows
    OR NEW.preview IS DISTINCT FROM OLD.preview
    OR NEW.staged_by_user_id IS DISTINCT FROM OLD.staged_by_user_id
    OR NEW.staged_at IS DISTINCT FROM OLD.staged_at
    OR NEW.status <> 'confirmed'
    OR NEW.confirmed_by_user_id IS NULL
    OR NEW.confirmed_at IS NULL THEN
    RAISE EXCEPTION 'assignment source revision is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER booklet_assignment_source_revision_immutable
BEFORE INSERT OR UPDATE ON public.booklet_assignment_source_revision
FOR EACH ROW EXECUTE FUNCTION public.booklet_guard_assignment_source_revision();
