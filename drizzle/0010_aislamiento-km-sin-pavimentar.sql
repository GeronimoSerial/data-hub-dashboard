ALTER TABLE "infra_aislamiento_osm" ADD COLUMN IF NOT EXISTS "tramos_sin_pavimentar_km" real;
--> statement-breakpoint
ALTER TABLE "infra_aislamiento_osm" ADD COLUMN IF NOT EXISTS "tiene_alternativa_pavimentada" boolean;
