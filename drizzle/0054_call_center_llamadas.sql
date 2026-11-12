CREATE TABLE "call_center_llamadas" (
	"id" text PRIMARY KEY NOT NULL,
	"cue_anexo" text NOT NULL,
	"usuario_id" text NOT NULL,
	"caller_nombre" text NOT NULL,
	"justificacion" text NOT NULL,
	"respuesta_director" text NOT NULL,
	"creada_en" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "call_center_llamadas_cue_anexo_idx" ON "call_center_llamadas" USING btree ("cue_anexo");