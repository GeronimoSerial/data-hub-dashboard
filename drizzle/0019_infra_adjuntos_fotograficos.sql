CREATE TABLE "infra_adjunto" (
	"id" text PRIMARY KEY NOT NULL,
	"movimiento_id" text NOT NULL,
	"optimizada_obs_key" text NOT NULL,
	"optimizada_size" integer NOT NULL,
	"optimizada_content_type" text NOT NULL,
	"optimizada_etag" text,
	"miniatura_obs_key" text NOT NULL,
	"miniatura_size" integer NOT NULL,
	"miniatura_content_type" text NOT NULL,
	"miniatura_etag" text,
	"estado" text DEFAULT 'pending' NOT NULL,
	"creada_por" text NOT NULL,
	CONSTRAINT "infra_adjunto_optimizada_size_check" CHECK ("optimizada_size" > 0),
	CONSTRAINT "infra_adjunto_miniatura_size_check" CHECK ("miniatura_size" > 0),
	CONSTRAINT "infra_adjunto_estado_check" CHECK ("estado" IN ('pending', 'confirmed'))
);
--> statement-breakpoint
ALTER TABLE "infra_adjunto" ADD CONSTRAINT "infra_adjunto_movimiento_id_infra_movimiento_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."infra_movimiento"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "infra_adjunto_movimiento_id_idx" ON "infra_adjunto" USING btree ("movimiento_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "infra_adjunto_optimizada_obs_key_uidx" ON "infra_adjunto" USING btree ("optimizada_obs_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "infra_adjunto_miniatura_obs_key_uidx" ON "infra_adjunto" USING btree ("miniatura_obs_key");
--> statement-breakpoint
CREATE FUNCTION infra_adjunto_limitar_fotos_movimiento() RETURNS trigger AS $$
DECLARE
	foto_count integer;
BEGIN
	-- Locking the parent serializes all inserts for this movement, including
	-- writers that do not use the application service transaction.
	PERFORM id FROM infra_movimiento WHERE id = NEW.movimiento_id FOR UPDATE;
	IF NOT FOUND THEN
		RAISE EXCEPTION 'movement does not exist' USING ERRCODE = 'foreign_key_violation';
	END IF;
	SELECT count(*) INTO foto_count
	FROM infra_adjunto
	WHERE movimiento_id = NEW.movimiento_id AND id <> NEW.id;
	IF foto_count >= 3 THEN
		RAISE EXCEPTION 'movement photo limit exceeded' USING ERRCODE = 'check_violation';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER infra_adjunto_limitar_fotos_movimiento_trigger
BEFORE INSERT OR UPDATE OF movimiento_id ON infra_adjunto
FOR EACH ROW EXECUTE FUNCTION infra_adjunto_limitar_fotos_movimiento();
