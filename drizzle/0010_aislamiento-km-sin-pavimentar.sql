ALTER TABLE "infra_aislamiento_osm" ADD COLUMN "tramos_sin_pavimentar_km" real;
--> statement-breakpoint
ALTER TABLE "infra_aislamiento_osm" ADD COLUMN "tiene_alternativa_pavimentada" boolean;
