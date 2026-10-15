CREATE TABLE "infra_borrador" (
	"id" text PRIMARY KEY NOT NULL,
	"generacion" integer NOT NULL,
	"cue_anexo" text NOT NULL,
	"contexto" jsonb NOT NULL,
	"paso" text NOT NULL,
	"respuestas" jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"estado" text DEFAULT 'open' NOT NULL,
	"movimiento_id" text,
	"creado_en" text NOT NULL,
	"actividad_en" text NOT NULL,
	"sincronizado_en" text,
	CONSTRAINT "infra_borrador_generacion_check" CHECK ("infra_borrador"."generacion" > 0),
	CONSTRAINT "infra_borrador_revision_check" CHECK ("infra_borrador"."revision" >= 0),
	CONSTRAINT "infra_borrador_estado_check" CHECK ("infra_borrador"."estado" IN ('open', 'submitted', 'discarded'))
);
--> statement-breakpoint
CREATE TABLE "infra_borrador_cierre" (
	"draft_id" text PRIMARY KEY NOT NULL,
	"cue_anexo" text NOT NULL,
	"estado_cierre" text NOT NULL,
	"revision_cierre" integer NOT NULL,
	"movimiento_id" text,
	"cerrado_en" text NOT NULL,
	CONSTRAINT "infra_borrador_cierre_estado_check" CHECK ("infra_borrador_cierre"."estado_cierre" IN ('submitted', 'discarded')),
	CONSTRAINT "infra_borrador_cierre_revision_check" CHECK ("infra_borrador_cierre"."revision_cierre" >= 0)
);
--> statement-breakpoint
ALTER TABLE "infra_borrador" ADD CONSTRAINT "infra_borrador_movimiento_id_infra_movimiento_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."infra_movimiento"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "infra_borrador_cierre" ADD CONSTRAINT "infra_borrador_cierre_movimiento_id_infra_movimiento_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."infra_movimiento"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "infra_borrador_cue_estado_idx" ON "infra_borrador" USING btree ("cue_anexo", "estado");
--> statement-breakpoint
CREATE INDEX "infra_borrador_cue_estado_actividad_id_idx" ON "infra_borrador" USING btree ("cue_anexo", "estado", "actividad_en", "id");
--> statement-breakpoint
CREATE FUNCTION infra_borrador_rechazar_cerrado() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'INSERT' AND NEW.revision <> 0 THEN
		RAISE EXCEPTION 'new draft revision must start at zero' USING ERRCODE = 'check_violation';
	END IF;
	IF TG_OP = 'UPDATE' AND NEW.revision <> OLD.revision + 1 THEN
		RAISE EXCEPTION 'draft revision must advance by one' USING ERRCODE = 'check_violation';
	END IF;
	IF EXISTS (SELECT 1 FROM infra_borrador_cierre WHERE draft_id = NEW.id) THEN
		RAISE EXCEPTION 'draft is closed' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER infra_borrador_rechazar_cerrado_trigger
BEFORE INSERT OR UPDATE ON infra_borrador
FOR EACH ROW EXECUTE FUNCTION infra_borrador_rechazar_cerrado();
--> statement-breakpoint
CREATE FUNCTION infra_borrador_cierre_inmutable() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'draft closure is permanent' USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER infra_borrador_cierre_inmutable_trigger
BEFORE UPDATE OR DELETE ON infra_borrador_cierre
FOR EACH ROW EXECUTE FUNCTION infra_borrador_cierre_inmutable();
