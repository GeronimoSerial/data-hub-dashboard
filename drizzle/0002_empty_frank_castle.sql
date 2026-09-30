CREATE TABLE "user_recursos" (
	"user_id" text NOT NULL,
	"recurso_id" text NOT NULL,
	CONSTRAINT "user_recursos_user_id_recurso_id_pk" PRIMARY KEY("user_id","recurso_id")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "acceso_recursos" text DEFAULT 'todos' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_recursos" ADD CONSTRAINT "user_recursos_recurso_id_recursos_id_fk" FOREIGN KEY ("recurso_id") REFERENCES "public"."recursos"("id") ON DELETE no action ON UPDATE no action;