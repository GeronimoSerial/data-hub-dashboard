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
CREATE INDEX "radar_meteo_verificacion_fecha_idx" ON "radar_meteo_verificacion" USING btree ("fecha");