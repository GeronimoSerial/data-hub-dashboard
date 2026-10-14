CREATE TABLE "hidro_referencia" (
	"estacion_id" text NOT NULL,
	"ventana_dias" integer NOT NULL,
	"n" integer NOT NULL,
	"mediana_m" double precision NOT NULL,
	"p10_m" double precision NOT NULL,
	"p90_m" double precision NOT NULL,
	"desde" text NOT NULL,
	"hasta" text NOT NULL,
	"fuente" text DEFAULT 'prefectura-historico' NOT NULL,
	"calculado_en" text NOT NULL,
	CONSTRAINT "hidro_referencia_estacion_id_ventana_dias_pk" PRIMARY KEY("estacion_id","ventana_dias")
);
--> statement-breakpoint
CREATE TABLE "infra_exposicion_rio_dem" (
	"cue_anexo" text NOT NULL,
	"version_job" text NOT NULL,
	"suelo_m" real,
	"nivel_rio_dem_m" real,
	"distancia_rio_m" real,
	"fuente" text NOT NULL,
	"fecha_corrida" text NOT NULL,
	"importado_en" text NOT NULL,
	CONSTRAINT "infra_exposicion_rio_dem_cue_anexo_version_job_pk" PRIMARY KEY("cue_anexo","version_job")
);
