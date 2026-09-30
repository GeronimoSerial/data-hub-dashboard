CREATE TABLE "radar_meteo_ensemble_run" (
	"id" text PRIMARY KEY NOT NULL,
	"model" text NOT NULL,
	"run_at" text NOT NULL,
	"fetched_at" text NOT NULL,
	"timezone" text NOT NULL,
	"department_geo_version" text NOT NULL,
	"forecast_start" text NOT NULL,
	"forecast_end" text NOT NULL,
	"status" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "radar_meteo_verificacion" (
	"fecha" text NOT NULL,
	"departamento" text NOT NULL,
	"run_id" text NOT NULL,
	"pronostico_mm" real,
	"observado_mm" real,
	"cobertura_obs" real NOT NULL,
	"motivo_exclusion" text,
	"version_algoritmo" text NOT NULL,
	"creado_en" text NOT NULL,
	CONSTRAINT "radar_meteo_verificacion_fecha_departamento_pk" PRIMARY KEY("fecha","departamento")
);
--> statement-breakpoint
CREATE TABLE "smn_alerta" (
	"id" text PRIMARY KEY NOT NULL,
	"sender" text NOT NULL,
	"sent" text NOT NULL,
	"onset" text,
	"expires" text,
	"event" text NOT NULL,
	"severity" text NOT NULL,
	"urgency" text,
	"certainty" text,
	"headline" text,
	"description" text,
	"instruction" text,
	"nivel_sat" text,
	"departamentos" jsonb NOT NULL,
	"poligonos" jsonb NOT NULL,
	"raw" text NOT NULL,
	"fetched_at" text NOT NULL,
	"cancelada" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "radar_meteo_ensemble_run_idempotency_uidx" ON "radar_meteo_ensemble_run" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "radar_meteo_ensemble_run_status_fetched_idx" ON "radar_meteo_ensemble_run" USING btree ("status","fetched_at");--> statement-breakpoint
CREATE INDEX "radar_meteo_verificacion_fecha_idx" ON "radar_meteo_verificacion" USING btree ("fecha");--> statement-breakpoint
CREATE INDEX "smn_alerta_fetched_idx" ON "smn_alerta" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "smn_alerta_expires_idx" ON "smn_alerta" USING btree ("expires");