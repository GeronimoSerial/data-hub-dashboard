CREATE TABLE IF NOT EXISTS "hidro_lectura" (
	"id" text PRIMARY KEY NOT NULL,
	"estacion_id" text NOT NULL,
	"fuente" text DEFAULT 'prefectura' NOT NULL,
	"lectura_m" double precision,
	"variacion_m" double precision,
	"periodo_horas" integer,
	"medida_en" text NOT NULL,
	"estado_publicado" text NOT NULL,
	"lectura_anterior_m" double precision,
	"medida_anterior_en" text,
	"alerta_m" double precision,
	"evacuacion_m" double precision,
	"inconsistente" boolean DEFAULT false NOT NULL,
	"motivos_inconsistencia" jsonb NOT NULL,
	"hash_original" text NOT NULL,
	"catalogo_version" text NOT NULL,
	"capturada_en" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hidro_lectura_estacion_medida_uidx" ON "hidro_lectura" USING btree ("estacion_id","medida_en");