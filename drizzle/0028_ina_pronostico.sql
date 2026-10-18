CREATE TABLE IF NOT EXISTS "hidro_ina_corrida" (
	"cal_id" integer NOT NULL,
	"cor_id" integer NOT NULL,
	"forecast_date" text NOT NULL,
	"descargado_en" text NOT NULL,
	"lote_sha256" text NOT NULL,
	CONSTRAINT "hidro_ina_corrida_cal_id_cor_id_pk" PRIMARY KEY("cal_id","cor_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hidro_ina_pronostico" (
	"cal_id" integer NOT NULL,
	"cor_id" integer NOT NULL,
	"series_id" integer NOT NULL,
	"estacion_id" text,
	"variable" text,
	"unidad" text,
	"timestart" text NOT NULL,
	"timeend" text NOT NULL,
	"soporte" text NOT NULL,
	"qualifier" text,
	"valor" double precision NOT NULL,
	CONSTRAINT "hidro_ina_pronostico_soporte_check" CHECK ("hidro_ina_pronostico"."soporte" in ('semanal_media', 'diario', 'instantaneo', 'desconocido'))
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hidro_ina_corrida_lote_sha256_hidro_lote_crudo_sha256_fk') THEN
		ALTER TABLE "hidro_ina_corrida" ADD CONSTRAINT "hidro_ina_corrida_lote_sha256_hidro_lote_crudo_sha256_fk" FOREIGN KEY ("lote_sha256") REFERENCES "public"."hidro_lote_crudo"("sha256") ON DELETE no action ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hidro_ina_pronostico_cal_id_cor_id_hidro_ina_corrida_cal_id_cor_id_fk') THEN
		ALTER TABLE "hidro_ina_pronostico" ADD CONSTRAINT "hidro_ina_pronostico_cal_id_cor_id_hidro_ina_corrida_cal_id_cor_id_fk" FOREIGN KEY ("cal_id","cor_id") REFERENCES "public"."hidro_ina_corrida"("cal_id","cor_id") ON DELETE no action ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "hidro_ina_corrida_cal_forecast_idx" ON "hidro_ina_corrida" USING btree ("cal_id","forecast_date");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hidro_ina_pronostico_valor_uq" ON "hidro_ina_pronostico" USING btree ("cor_id","series_id","timestart","timeend",coalesce("qualifier", ''));