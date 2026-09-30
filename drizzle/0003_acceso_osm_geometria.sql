CREATE TABLE "infra_acceso_osm_geometria" (
	"cue_anexo" text NOT NULL,
	"version_job" text NOT NULL,
	"ruta" jsonb,
	"cruces" jsonb NOT NULL,
	"motivo_sin_geometria" text,
	"fecha_extracto_osm" text NOT NULL,
	"licencia" text NOT NULL,
	"importado_en" text NOT NULL,
	CONSTRAINT "infra_acceso_osm_geometria_cue_anexo_version_job_pk" PRIMARY KEY("cue_anexo","version_job")
);
