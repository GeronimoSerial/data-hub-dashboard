-- Current eligibility reads rely on these public sources: period selection,
-- part/affectation presence and severity, GE affected-section/student scopes,
-- and the active matrícula cut/career classification. A statement-level
-- trigger covers inserts/updates/deletes, including phantoms that row locks
-- cannot cover. Triggers can be disabled by a privileged database operator;
-- this is not protection against a superuser bypass.
-- Approval acquires the shared lock before any projection or row lock. PostgreSQL
-- takes a source writer's compatible RowExclusive table lock before this
-- statement trigger; the source rows are not changed until its exclusive
-- advisory lock is granted, so projection SELECTs can finish without a cycle.
CREATE OR REPLACE FUNCTION public.booklet_eligibility_source_write_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(1129660740, 1162625351);
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER booklet_eligibility_source_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.infra_periodo
FOR EACH STATEMENT EXECUTE FUNCTION public.booklet_eligibility_source_write_guard();
--> statement-breakpoint
CREATE TRIGGER booklet_eligibility_source_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.infra_parte
FOR EACH STATEMENT EXECUTE FUNCTION public.booklet_eligibility_source_write_guard();
--> statement-breakpoint
CREATE TRIGGER booklet_eligibility_source_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.infra_afectacion
FOR EACH STATEMENT EXECUTE FUNCTION public.booklet_eligibility_source_write_guard();
--> statement-breakpoint
CREATE TRIGGER booklet_eligibility_source_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.infra_afectacion_seccion
FOR EACH STATEMENT EXECUTE FUNCTION public.booklet_eligibility_source_write_guard();
--> statement-breakpoint
CREATE TRIGGER booklet_eligibility_source_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.infra_afectacion_alumno
FOR EACH STATEMENT EXECUTE FUNCTION public.booklet_eligibility_source_write_guard();
--> statement-breakpoint
CREATE TRIGGER booklet_eligibility_source_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.matricula_corte
FOR EACH STATEMENT EXECUTE FUNCTION public.booklet_eligibility_source_write_guard();
--> statement-breakpoint
CREATE TRIGGER booklet_eligibility_source_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.matricula_carrera
FOR EACH STATEMENT EXECUTE FUNCTION public.booklet_eligibility_source_write_guard();
