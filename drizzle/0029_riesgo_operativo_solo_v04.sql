-- NOT VALID conserva las corridas históricas y permite reemplazar un vigente
-- antiguo mediante el publicador atómico. Toda nueva publicación exige v0.4.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'infra_risk_run_vigente_solo_v04'
      AND conrelid = 'public.infra_risk_run'::regclass
  ) THEN
    ALTER TABLE "infra_risk_run"
      ADD CONSTRAINT "infra_risk_run_vigente_solo_v04"
      CHECK ("estado" <> 'vigente' OR "modelo_version" = 'motor-v0.4') NOT VALID;
  END IF;
END $$;
