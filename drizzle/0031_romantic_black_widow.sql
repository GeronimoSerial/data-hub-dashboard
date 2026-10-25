CREATE TABLE "infra_radar_run_cache" (
	"cache_key" text PRIMARY KEY NOT NULL,
	"environment" text NOT NULL,
	"risk_run_id" text NOT NULL,
	"modelo_version" text NOT NULL,
	"publicado_en" text NOT NULL,
	"reglas_version" text NOT NULL,
	"referencias_fingerprint" text NOT NULL,
	"estado" text NOT NULL,
	"lease_owner" text,
	"lease_expira_en" text,
	"payload" jsonb,
	"creada_en" text NOT NULL,
	"actualizada_en" text NOT NULL,
	CONSTRAINT "infra_radar_run_cache_estado_check" CHECK ("infra_radar_run_cache"."estado" IN ('building', 'ready', 'failed')),
	CONSTRAINT "infra_radar_run_cache_payload_check" CHECK (("infra_radar_run_cache"."estado" = 'ready' AND "infra_radar_run_cache"."payload" IS NOT NULL AND "infra_radar_run_cache"."lease_owner" IS NULL AND "infra_radar_run_cache"."lease_expira_en" IS NULL) OR ("infra_radar_run_cache"."estado" = 'building' AND "infra_radar_run_cache"."payload" IS NULL AND "infra_radar_run_cache"."lease_owner" IS NOT NULL AND "infra_radar_run_cache"."lease_expira_en" IS NOT NULL) OR ("infra_radar_run_cache"."estado" = 'failed' AND "infra_radar_run_cache"."payload" IS NULL AND "infra_radar_run_cache"."lease_owner" IS NULL AND "infra_radar_run_cache"."lease_expira_en" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "infra_radar_run_cache" ADD CONSTRAINT "infra_radar_run_cache_risk_run_id_infra_risk_run_id_fk" FOREIGN KEY ("risk_run_id") REFERENCES "public"."infra_risk_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "infra_radar_run_cache_run_idx" ON "infra_radar_run_cache" USING btree ("risk_run_id");