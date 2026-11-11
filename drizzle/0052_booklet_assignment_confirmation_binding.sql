ALTER TABLE "booklet_school_assignment" ADD COLUMN "confirmed_assignment_hash" text;--> statement-breakpoint
ALTER TABLE "booklet_school_assignment" ADD CONSTRAINT "booklet_school_assignment_confirmation_hash_check" CHECK ("booklet_school_assignment"."confirmed_assignment_hash" IS NULL OR "booklet_school_assignment"."confirmed_assignment_hash" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
CREATE FUNCTION public.booklet_guard_confirmed_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.source_revision_id IS NOT NULL
    OR OLD.source_row_hash IS NOT NULL
    OR OLD.confirmed_assignment_hash IS NOT NULL THEN
    RAISE EXCEPTION 'confirmed assignment is immutable; stage and confirm a replacement revision' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER booklet_confirmed_assignment_immutable
BEFORE UPDATE ON public.booklet_school_assignment
FOR EACH ROW EXECUTE FUNCTION public.booklet_guard_confirmed_assignment();
