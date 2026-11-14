-- hazard_observation is large in production (millions of rows). Two operational notes:
-- 1. The migrator runs inside a transaction, so CREATE INDEX CONCURRENTLY is not possible here.
--    On big databases pre-create the index CONCURRENTLY under this exact name first (see
--    docs/2026-11-13-runbook-hazard-observation-indice.md); IF NOT EXISTS then makes this a no-op.
-- 2. The pool applies statement_timeout (30 s) to the migration session; lift it for this
--    transaction only so a cold build on a large table is not cancelled.
SET LOCAL statement_timeout = 0;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "hazard_observation_provider_variable_observado_idx" ON "hazard_observation" USING btree ("provider","variable","observado_en");
