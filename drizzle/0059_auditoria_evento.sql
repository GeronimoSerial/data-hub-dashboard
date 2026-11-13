CREATE TABLE "auditoria_evento" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text NOT NULL,
	"ocurrido_en" timestamp with time zone NOT NULL,
	"actor_tipo" text NOT NULL,
	"actor_id" text,
	"actor_rol" text,
	"via_acceso" text NOT NULL,
	"accion" text NOT NULL,
	"metodo" text NOT NULL,
	"ruta_plantilla" text NOT NULL,
	"objeto_tipo" text,
	"objeto_id" text,
	"cue_anexo" text,
	"resultado" text NOT NULL,
	"http_status" integer,
	"duracion_ms" integer NOT NULL,
	"metadatos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "auditoria_evento_metadatos_limite" CHECK (octet_length("auditoria_evento"."metadatos"::text) <= 4096)
);
--> statement-breakpoint
CREATE INDEX "auditoria_evento_fecha_idx" ON "auditoria_evento" USING btree ("ocurrido_en","id");--> statement-breakpoint
CREATE INDEX "auditoria_evento_actor_fecha_idx" ON "auditoria_evento" USING btree ("actor_id","ocurrido_en","id");
--> statement-breakpoint
CREATE FUNCTION auditoria_evento_solo_insercion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'auditoria_evento es de solo inserción' USING ERRCODE = 'restrict_violation'; END $$;
--> statement-breakpoint
CREATE TRIGGER auditoria_evento_solo_insercion BEFORE UPDATE OR DELETE ON auditoria_evento FOR EACH ROW EXECUTE FUNCTION auditoria_evento_solo_insercion();
