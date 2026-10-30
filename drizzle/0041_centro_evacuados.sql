CREATE TABLE "infra_centro_evacuados" (
	"cue_anexo" text PRIMARY KEY NOT NULL,
	"apto" boolean NOT NULL,
	"motivo" text,
	"destino_cue" text,
	"destino_nombre" text,
	"distancia_recta_m" real,
	"distancia_ruta_m" real,
	"calculado_en" text NOT NULL
);
