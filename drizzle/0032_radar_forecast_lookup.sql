CREATE INDEX IF NOT EXISTS "hazard_forecast_precipitacion_run_idx" ON "hazard_forecast" USING btree ("geometry_ref","corrida_en") WHERE "hazard_forecast"."variable" = 'precipitacion';
