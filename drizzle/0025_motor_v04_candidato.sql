ALTER TABLE "infra_risk_run" ADD COLUMN IF NOT EXISTS "modo" text DEFAULT 'operativo' NOT NULL;--> statement-breakpoint
ALTER TABLE "infra_risk_run" ADD COLUMN IF NOT EXISTS "metadatos" jsonb;--> statement-breakpoint
ALTER TABLE "infra_risk_snapshot" ADD COLUMN IF NOT EXISTS "resultado_v04" jsonb;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'infra_risk_run_modo_check') THEN
		ALTER TABLE "infra_risk_run" ADD CONSTRAINT "infra_risk_run_modo_check" CHECK ("infra_risk_run"."modo" IN ('operativo', 'candidato'));
	END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'infra_risk_run_candidato_no_vigente') THEN
		ALTER TABLE "infra_risk_run" ADD CONSTRAINT "infra_risk_run_candidato_no_vigente" CHECK ("infra_risk_run"."modo" <> 'candidato' OR "infra_risk_run"."estado" <> 'vigente');
	END IF;
END $$;
