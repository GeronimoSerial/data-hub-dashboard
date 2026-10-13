CREATE TABLE IF NOT EXISTS "hazard_precipitacion_serie" (
	"celda_era5" text NOT NULL,
	"anio" integer NOT NULL,
	"lat" real NOT NULL,
	"lon" real NOT NULL,
	"valores" jsonb NOT NULL,
	"dias_con_dato" integer NOT NULL,
	"descargado_en" text NOT NULL,
	CONSTRAINT "hazard_precipitacion_serie_celda_era5_anio_pk" PRIMARY KEY("celda_era5","anio")
);
--> statement-breakpoint
ALTER TABLE "hazard_climatology" ADD COLUMN IF NOT EXISTS "anios_cobertura" integer;--> statement-breakpoint
ALTER TABLE "hazard_climatology" ADD COLUMN IF NOT EXISTS "dias_cobertura" integer;
