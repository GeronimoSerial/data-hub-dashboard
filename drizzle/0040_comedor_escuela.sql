CREATE TABLE "infra_comedor_escuela" (
	"cue_anexo" text PRIMARY KEY NOT NULL,
	"desayuno" boolean NOT NULL,
	"almuerzo" boolean NOT NULL,
	"proveedor" text,
	"fuente" text NOT NULL,
	"importado_en" text NOT NULL
);
