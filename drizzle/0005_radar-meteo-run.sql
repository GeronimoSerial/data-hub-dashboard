CREATE TABLE "radar_meteo_run" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"grid_version" text NOT NULL,
	"run_at" text NOT NULL,
	"fetched_at" text NOT NULL,
	"forecast_start" text NOT NULL,
	"forecast_end" text NOT NULL,
	"step_minutes" integer NOT NULL,
	"units" jsonb NOT NULL,
	"status" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "radar_meteo_run_idempotency_uidx" ON "radar_meteo_run" USING btree ("idempotency_key");
--> statement-breakpoint
CREATE INDEX "radar_meteo_run_status_fetched_idx" ON "radar_meteo_run" USING btree ("status","fetched_at");
