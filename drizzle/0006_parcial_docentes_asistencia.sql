ALTER TABLE "infra_parte" ADD COLUMN "asistencia_pedagogica" text;
--> statement-breakpoint
INSERT INTO "infra_motivo" ("id", "nombre", "categoria", "orden")
VALUES ('inaccesibilidad-docentes', 'Inaccesibilidad de docentes', 'establecimiento', 50)
ON CONFLICT ("id") DO NOTHING;
