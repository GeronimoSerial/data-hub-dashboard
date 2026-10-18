CREATE TABLE IF NOT EXISTS "hidro_lote_crudo" (
	"sha256" text PRIMARY KEY NOT NULL,
	"fuente" text NOT NULL,
	"url" text NOT NULL,
	"serie_id" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"descargado_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hidro_serie_diaria" (
	"estacion_id" text NOT NULL,
	"fecha" text NOT NULL,
	"fuente" text NOT NULL,
	"valor_m" double precision NOT NULL,
	"serie_id" integer NOT NULL,
	"lote_sha256" text NOT NULL,
	"descargado_en" text NOT NULL,
	CONSTRAINT "hidro_serie_diaria_estacion_id_fecha_fuente_pk" PRIMARY KEY("estacion_id","fecha","fuente")
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hidro_serie_diaria_lote_sha256_hidro_lote_crudo_sha256_fk') THEN
		ALTER TABLE "hidro_serie_diaria" ADD CONSTRAINT "hidro_serie_diaria_lote_sha256_hidro_lote_crudo_sha256_fk" FOREIGN KEY ("lote_sha256") REFERENCES "public"."hidro_lote_crudo"("sha256") ON DELETE no action ON UPDATE no action;
	END IF;
END $$;
