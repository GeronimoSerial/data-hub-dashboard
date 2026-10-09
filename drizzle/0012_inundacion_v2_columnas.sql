ALTER TABLE "infra_exposicion_ruta_inundacion" ADD COLUMN "clase_ruta" text;--> statement-breakpoint
ALTER TABLE "infra_exposicion_ruta_inundacion" ADD COLUMN "muestras_total" integer;--> statement-breakpoint
ALTER TABLE "infra_exposicion_ruta_inundacion" ADD COLUMN "muestras_expuestas" integer;--> statement-breakpoint
ALTER TABLE "infra_exposicion_ruta_inundacion" ADD COLUMN "muestras_sin_dato" integer;--> statement-breakpoint
ALTER TABLE "infra_exposicion_ruta_inundacion" ADD COLUMN "profundidad_max_rp10_m" real;--> statement-breakpoint
ALTER TABLE "infra_exposicion_ruta_inundacion" ADD COLUMN "profundidad_max_rp100_m" real;--> statement-breakpoint
ALTER TABLE "infra_exposicion_ruta_inundacion" ADD COLUMN "profundidad_max_rp500_m" real;--> statement-breakpoint
ALTER TABLE "infra_susceptibilidad_estatica" ADD COLUMN "clase_rio" text;--> statement-breakpoint
ALTER TABLE "infra_susceptibilidad_estatica" ADD COLUMN "profundidad_rp10_m" real;--> statement-breakpoint
ALTER TABLE "infra_susceptibilidad_estatica" ADD COLUMN "profundidad_rp100_m" real;--> statement-breakpoint
ALTER TABLE "infra_susceptibilidad_estatica" ADD COLUMN "profundidad_rp500_m" real;--> statement-breakpoint
ALTER TABLE "infra_susceptibilidad_estatica" ADD COLUMN "margen_rp10_m" real;--> statement-breakpoint
ALTER TABLE "infra_susceptibilidad_estatica" ADD COLUMN "margen_rp100_m" real;--> statement-breakpoint
ALTER TABLE "infra_susceptibilidad_estatica" ADD COLUMN "margen_rp500_m" real;--> statement-breakpoint
ALTER TABLE "infra_susceptibilidad_estatica" ADD COLUMN "junto_laguna" boolean;--> statement-breakpoint
ALTER TABLE "infra_susceptibilidad_estatica" ADD COLUMN "distancia_agua_m" real;--> statement-breakpoint
ALTER TABLE "infra_susceptibilidad_estatica" ADD COLUMN "altura_sobre_agua_m" real;--> statement-breakpoint
ALTER TABLE "infra_susceptibilidad_estatica" ADD COLUMN "version_inundacion" integer;