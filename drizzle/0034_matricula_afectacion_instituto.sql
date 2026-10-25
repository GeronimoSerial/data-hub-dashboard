CREATE TABLE "infra_afectacion_carrera" (
	"afectacion_id" text NOT NULL,
	"matricula_corte_id" integer NOT NULL,
	"carrera_id" integer NOT NULL,
	CONSTRAINT "infra_afectacion_carrera_afectacion_id_carrera_id_pk" PRIMARY KEY("afectacion_id","carrera_id")
);
--> statement-breakpoint
CREATE TABLE "infra_afectacion_matricula_alumno" (
	"afectacion_id" text NOT NULL,
	"matricula_corte_id" integer NOT NULL,
	"alumno_id" bigint NOT NULL,
	CONSTRAINT "infra_afectacion_matricula_alumno_afectacion_id_alumno_id_pk" PRIMARY KEY("afectacion_id","alumno_id")
);
--> statement-breakpoint
ALTER TABLE "infra_afectacion_carrera" ADD CONSTRAINT "infra_afectacion_carrera_afectacion_id_infra_afectacion_id_fk" FOREIGN KEY ("afectacion_id") REFERENCES "public"."infra_afectacion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_afectacion_matricula_alumno" ADD CONSTRAINT "infra_afectacion_matricula_alumno_afectacion_id_infra_afectacion_id_fk" FOREIGN KEY ("afectacion_id") REFERENCES "public"."infra_afectacion"("id") ON DELETE cascade ON UPDATE no action;