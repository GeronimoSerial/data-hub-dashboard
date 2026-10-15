CREATE TABLE "ge_sso_evento" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ge_sso_evento_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"email" text,
	"rol" text,
	"cue" text,
	"nivel_jurisdiccional_id" integer,
	"ip" text,
	"resultado" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "niveles_jurisdiccionales" (
	"id" integer PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurso_audiencia_niveles_jur" (
	"recurso_id" text NOT NULL,
	"nivel_jurisdiccional_id" integer NOT NULL,
	CONSTRAINT "recurso_audiencia_niveles_jur_recurso_id_nivel_jurisdiccional_id_pk" PRIMARY KEY("recurso_id","nivel_jurisdiccional_id")
);
--> statement-breakpoint
CREATE TABLE "user_niveles_jur" (
	"user_id" text NOT NULL,
	"nivel_jurisdiccional_id" integer NOT NULL,
	CONSTRAINT "user_niveles_jur_user_id_nivel_jurisdiccional_id_pk" PRIMARY KEY("user_id","nivel_jurisdiccional_id")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ge_cue_anexo" text;--> statement-breakpoint
ALTER TABLE "recurso_audiencia_niveles_jur" ADD CONSTRAINT "recurso_audiencia_niveles_jur_recurso_id_recursos_id_fk" FOREIGN KEY ("recurso_id") REFERENCES "public"."recursos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurso_audiencia_niveles_jur" ADD CONSTRAINT "recurso_audiencia_niveles_jur_nivel_jurisdiccional_id_niveles_jurisdiccionales_id_fk" FOREIGN KEY ("nivel_jurisdiccional_id") REFERENCES "public"."niveles_jurisdiccionales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_niveles_jur" ADD CONSTRAINT "user_niveles_jur_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_niveles_jur" ADD CONSTRAINT "user_niveles_jur_nivel_jurisdiccional_id_niveles_jurisdiccionales_id_fk" FOREIGN KEY ("nivel_jurisdiccional_id") REFERENCES "public"."niveles_jurisdiccionales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "niveles_jurisdiccionales" ("id", "nombre") VALUES (1, 'Dirección de Nivel Secundario'), (2, 'Dirección de Enseñanza Privada'), (4, 'Dirección de Nivel Superior'), (5, 'Dirección de Educación Técnico Profesional'), (6, 'Dirección de Educación Física'), (7, 'Nivel Central'), (9, 'Consejo General de Educación') ON CONFLICT DO NOTHING;
