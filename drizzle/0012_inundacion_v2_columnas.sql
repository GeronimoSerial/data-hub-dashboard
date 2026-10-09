ALTER TABLE "infra_exposicion_ruta_inundacion" ADD COLUMN IF NOT EXISTS "clase_ruta" text;--> statement-breakpoint
ALTER TABLE "infra_exposicion_ruta_inundacion" ADD COLUMN IF NOT EXISTS "muestras_total" integer;--> statement-breakpoint
ALTER TABLE "infra_exposicion_ruta_inundacion" ADD COLUMN IF NOT EXISTS "muestras_expuestas" integer;--> statement-breakpoint
ALTER TABLE "infra_exposicion_ruta_inundacion" ADD COLUMN IF NOT EXISTS "muestras_sin_dato" integer;--> statement-breakpoint
ALTER TABLE "infra_exposicion_ruta_inundacion" ADD COLUMN IF NOT EXISTS "profundidad_max_rp10_m" real;--> statement-breakpoint
ALTER TABLE "infra_exposicion_ruta_inundacion" ADD COLUMN IF NOT EXISTS "profundidad_max_rp100_m" real;--> statement-breakpoint
ALTER TABLE "infra_exposicion_ruta_inundacion" ADD COLUMN IF NOT EXISTS "profundidad_max_rp500_m" real;--> statement-breakpoint
ALTER TABLE "infra_susceptibilidad_estatica" ADD COLUMN IF NOT EXISTS "clase_rio" text;--> statement-breakpoint
ALTER TABLE "infra_susceptibilidad_estatica" ADD COLUMN IF NOT EXISTS "profundidad_rp10_m" real;--> statement-breakpoint
ALTER TABLE "infra_susceptibilidad_estatica" ADD COLUMN IF NOT EXISTS "profundidad_rp100_m" real;--> statement-breakpoint
ALTER TABLE "infra_susceptibilidad_estatica" ADD COLUMN IF NOT EXISTS "profundidad_rp500_m" real;--> statement-breakpoint
ALTER TABLE "infra_susceptibilidad_estatica" ADD COLUMN IF NOT EXISTS "margen_rp10_m" real;--> statement-breakpoint
ALTER TABLE "infra_susceptibilidad_estatica" ADD COLUMN IF NOT EXISTS "margen_rp100_m" real;--> statement-breakpoint
ALTER TABLE "infra_susceptibilidad_estatica" ADD COLUMN IF NOT EXISTS "margen_rp500_m" real;--> statement-breakpoint
ALTER TABLE "infra_susceptibilidad_estatica" ADD COLUMN IF NOT EXISTS "junto_laguna" boolean;--> statement-breakpoint
ALTER TABLE "infra_susceptibilidad_estatica" ADD COLUMN IF NOT EXISTS "distancia_agua_m" real;--> statement-breakpoint
ALTER TABLE "infra_susceptibilidad_estatica" ADD COLUMN IF NOT EXISTS "altura_sobre_agua_m" real;--> statement-breakpoint
ALTER TABLE "infra_susceptibilidad_estatica" ADD COLUMN IF NOT EXISTS "version_inundacion" integer;