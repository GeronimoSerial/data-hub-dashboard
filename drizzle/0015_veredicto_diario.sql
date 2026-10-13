CREATE TABLE IF NOT EXISTS "infra_veredicto_dia" (
	"id" text PRIMARY KEY NOT NULL,
	"fecha" text NOT NULL,
	"ambito" text NOT NULL,
	"tipo_dia" text NOT NULL,
	"nivel" text NOT NULL,
	"traza_reglas" jsonb NOT NULL,
	"version_reglas" text,
	"metricas" jsonb NOT NULL,
	"inputs_hash" text,
	"cobertura" jsonb NOT NULL,
	"texto_final" text,
	"salida_ia" jsonb,
	"fuente" text NOT NULL,
	"motivo_fallback" text,
	"modelo" text,
	"version_prompt" text,
	"tokens_entrada" integer,
	"tokens_salida" integer,
	"costo_usd" real,
	"latencia_ms" integer,
	"en_calibracion" boolean DEFAULT true NOT NULL,
	"generado_en" text NOT NULL,
	"job_run_id" text,
	"reemplazado_por" text,
	"cerrado" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "infra_veredicto_enlace" (
	"id" text PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"fecha_desde" text,
	"fecha_hasta" text,
	"creado_por" text NOT NULL,
	"creado_en" text,
	"vence_en" text,
	"revocado_en" text,
	"revocado_por" text,
	CONSTRAINT "infra_veredicto_enlace_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "infra_veredicto_dia_hash_idx" ON "infra_veredicto_dia" USING btree ("fecha","ambito","inputs_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "infra_veredicto_dia_vigente_uidx" ON "infra_veredicto_dia" USING btree ("fecha","ambito") WHERE "infra_veredicto_dia"."reemplazado_por" is null;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "infra_veredicto_dia_generado_en_idx" ON "infra_veredicto_dia" USING btree ("generado_en");