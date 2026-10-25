CREATE TABLE "matricula_alumno" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"corte_id" integer NOT NULL,
	"carrera_id" integer NOT NULL,
	"apellidos" text NOT NULL,
	"nombres" text NOT NULL,
	"nombre_busqueda" text NOT NULL,
	"dni_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matricula_carrera" (
	"id" serial PRIMARY KEY NOT NULL,
	"corte_id" integer NOT NULL,
	"cue_anexo" text NOT NULL,
	"instituto" text NOT NULL,
	"nombre" text NOT NULL,
	"rm" text NOT NULL,
	"tipo" text NOT NULL,
	"estado" text NOT NULL,
	"sector" text NOT NULL,
	CONSTRAINT "matricula_carrera_estado_check" CHECK ("matricula_carrera"."estado" IN ('ABIERTA', 'CERRADA')),
	CONSTRAINT "matricula_carrera_sector_check" CHECK ("matricula_carrera"."sector" IN ('estatal', 'privado'))
);
--> statement-breakpoint
CREATE TABLE "matricula_corte" (
	"id" serial PRIMARY KEY NOT NULL,
	"fuente" text NOT NULL,
	"ciclo_lectivo" integer NOT NULL,
	"estado" text NOT NULL,
	"creado_en" text NOT NULL,
	"filas_importadas" integer DEFAULT 0 NOT NULL,
	"filas_excluidas" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "matricula_corte_estado_check" CHECK ("matricula_corte"."estado" IN ('cargando', 'vigente', 'reemplazado', 'fallido'))
);
--> statement-breakpoint
ALTER TABLE "matricula_alumno" ADD CONSTRAINT "matricula_alumno_corte_id_matricula_corte_id_fk" FOREIGN KEY ("corte_id") REFERENCES "public"."matricula_corte"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matricula_alumno" ADD CONSTRAINT "matricula_alumno_carrera_id_matricula_carrera_id_fk" FOREIGN KEY ("carrera_id") REFERENCES "public"."matricula_carrera"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matricula_carrera" ADD CONSTRAINT "matricula_carrera_corte_id_matricula_corte_id_fk" FOREIGN KEY ("corte_id") REFERENCES "public"."matricula_corte"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "matricula_alumno_carrera_dni_uidx" ON "matricula_alumno" USING btree ("carrera_id","dni_hash");--> statement-breakpoint
CREATE INDEX "matricula_alumno_busqueda_idx" ON "matricula_alumno" USING btree ("carrera_id","nombre_busqueda" text_pattern_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "matricula_carrera_uidx" ON "matricula_carrera" USING btree ("corte_id","cue_anexo","nombre","rm");--> statement-breakpoint
CREATE INDEX "matricula_carrera_cue_idx" ON "matricula_carrera" USING btree ("corte_id","cue_anexo");--> statement-breakpoint
CREATE UNIQUE INDEX "matricula_corte_vigente_uidx" ON "matricula_corte" USING btree ("estado") WHERE "matricula_corte"."estado" = 'vigente';