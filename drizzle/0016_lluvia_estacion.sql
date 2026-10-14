CREATE TABLE IF NOT EXISTS "lluvia_estacion" (
	"id" text PRIMARY KEY NOT NULL,
	"estacion_wmo" text NOT NULL,
	"observado_en" text NOT NULL,
	"periodo_horas" integer NOT NULL,
	"seccion" integer NOT NULL,
	"precipitacion_mm" double precision NOT NULL,
	"traza" boolean DEFAULT false NOT NULL,
	"fuente" text DEFAULT 'ogimet-synop' NOT NULL,
	"capturada_en" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lluvia_estacion_uidx" ON "lluvia_estacion" USING btree ("estacion_wmo","observado_en","periodo_horas","seccion");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lluvia_estacion_observado_en_idx" ON "lluvia_estacion" USING btree ("observado_en");
