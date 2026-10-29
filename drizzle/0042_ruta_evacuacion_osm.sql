CREATE TABLE "infra_ruta_evacuacion_osm" (
	"cue_anexo" text NOT NULL,
	"version_job" text NOT NULL,
	"candidatos" jsonb NOT NULL,
	"fecha_extracto_osm" text NOT NULL,
	"licencia" text NOT NULL,
	"importado_en" text NOT NULL,
	CONSTRAINT "infra_ruta_evacuacion_osm_cue_anexo_version_job_pk" PRIMARY KEY("cue_anexo","version_job")
);
