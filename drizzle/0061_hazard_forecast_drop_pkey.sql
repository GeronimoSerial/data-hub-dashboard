-- hazard_forecast_pkey (id) has 0 scans in production and weighs ~4 GB. Every write path
-- upserts on the 5-column unique index hazard_forecast_uidx; id is never a conflict target.
-- DROP CONSTRAINT takes a brief ACCESS EXCLUSIVE lock: fail fast instead of queueing behind
-- (and blocking) the 6-hourly sync-pronostico-caudal inserts. In production pre-apply it by hand
-- (docs/2026-11-14-runbook-hazard-forecast-pkey.md); IF EXISTS then makes this a no-op.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "hazard_forecast" DROP CONSTRAINT IF EXISTS "hazard_forecast_pkey";
