CREATE TABLE IF NOT EXISTS "infra_altimetria_escolar" (
	"cue_anexo" text NOT NULL,
	"version" text NOT NULL,
	"estado" text NOT NULL,
	"motivo" text,
	"ign_p10_m" double precision,
	"copernicus_p10_m" double precision,
	"cota_principal_m" double precision,
	"cota_conservadora_m" double precision,
	"fuente_conservadora" text,
	"fuentes_validas" integer NOT NULL,
	"referencia_vertical" text NOT NULL,
	"operador" text NOT NULL,
	"conversion" text NOT NULL,
	"origen_sha256" text NOT NULL,
	"importado_en" text NOT NULL,
	CONSTRAINT "infra_altimetria_escolar_cue_anexo_version_pk" PRIMARY KEY("cue_anexo","version"),
	CONSTRAINT "infra_altimetria_escolar_estado_check" CHECK ("infra_altimetria_escolar"."estado" IN ('candidata', 'pendiente'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "infra_altimetria_escolar_version_idx" ON "infra_altimetria_escolar" USING btree ("version","importado_en");