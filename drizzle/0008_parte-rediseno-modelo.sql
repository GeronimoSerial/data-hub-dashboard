ALTER TABLE "infra_afectacion" ADD COLUMN "justificacion_critica" text;--> statement-breakpoint
ALTER TABLE "infra_afectacion" ADD COLUMN "justificacion_critica_detalle" text;--> statement-breakpoint
ALTER TABLE "infra_afectacion" ADD COLUMN "causada_por_id" text;--> statement-breakpoint
ALTER TABLE "infra_afectacion" ADD COLUMN "cierre" text;--> statement-breakpoint
ALTER TABLE "infra_motivo" ADD COLUMN "severidad_sugerida" text;--> statement-breakpoint
CREATE INDEX "infra_afectacion_causada_por_id_idx" ON "infra_afectacion" USING btree ("causada_por_id");--> statement-breakpoint
UPDATE "infra_motivo" SET "severidad_sugerida" = 'Crítica' WHERE "id" IN ('inundacion', 'evacuacion-preventiva') AND "severidad_sugerida" IS NULL;--> statement-breakpoint
UPDATE "infra_motivo" SET "severidad_sugerida" = 'Alta' WHERE "id" IN ('tormenta-severa', 'inaccesibilidad-docentes', 'anegamiento', 'acceso-interrumpido') AND "severidad_sugerida" IS NULL;--> statement-breakpoint
UPDATE "infra_motivo" SET "severidad_sugerida" = 'Media' WHERE "id" = 'sin-energia-o-agua' AND "severidad_sugerida" IS NULL;--> statement-breakpoint
UPDATE "infra_afectacion" SET "cierre" = 'retirada' WHERE "retirada_en" IS NOT NULL AND "cierre" IS NULL;
