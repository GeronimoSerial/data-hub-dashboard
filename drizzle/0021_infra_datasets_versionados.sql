CREATE TABLE "infra_dataset" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infra_dataset_dependencia" (
	"version_id" text NOT NULL,
	"entrada_id" text NOT NULL,
	CONSTRAINT "infra_dataset_dependencia_version_id_entrada_id_pk" PRIMARY KEY("version_id","entrada_id")
);
--> statement-breakpoint
CREATE TABLE "infra_dataset_publicacion" (
	"dataset_id" text PRIMARY KEY NOT NULL,
	"version_id" text NOT NULL,
	"publicada_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infra_dataset_registro" (
	"version_id" text NOT NULL,
	"clave" text NOT NULL,
	"orden" integer NOT NULL,
	"datos" jsonb NOT NULL,
	CONSTRAINT "infra_dataset_registro_version_id_clave_pk" PRIMARY KEY("version_id","clave")
);
--> statement-breakpoint
CREATE TABLE "infra_dataset_version" (
	"id" text PRIMARY KEY NOT NULL,
	"dataset_id" text NOT NULL,
	"revision" text NOT NULL,
	"checksum" text NOT NULL,
	"fuente" text NOT NULL,
	"licencia" text,
	"fecha_fuente" timestamp with time zone,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"formato" text NOT NULL,
	"estructura" jsonb NOT NULL,
	"metadatos" jsonb NOT NULL,
	"filas" integer NOT NULL,
	CONSTRAINT "infra_dataset_version_filas_check" CHECK ("infra_dataset_version"."filas" > 0)
);
--> statement-breakpoint
ALTER TABLE "infra_dataset_dependencia" ADD CONSTRAINT "infra_dataset_dependencia_version_id_infra_dataset_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."infra_dataset_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_dataset_dependencia" ADD CONSTRAINT "infra_dataset_dependencia_entrada_id_infra_dataset_version_id_fk" FOREIGN KEY ("entrada_id") REFERENCES "public"."infra_dataset_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_dataset_publicacion" ADD CONSTRAINT "infra_dataset_publicacion_dataset_id_infra_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."infra_dataset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "infra_dataset_version_dataset_id_uidx" ON "infra_dataset_version" USING btree ("dataset_id","id");--> statement-breakpoint
ALTER TABLE "infra_dataset_publicacion" ADD CONSTRAINT "infra_dataset_publicacion_version_fk" FOREIGN KEY ("dataset_id","version_id") REFERENCES "public"."infra_dataset_version"("dataset_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_dataset_registro" ADD CONSTRAINT "infra_dataset_registro_version_id_infra_dataset_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."infra_dataset_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_dataset_version" ADD CONSTRAINT "infra_dataset_version_dataset_id_infra_dataset_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."infra_dataset"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "infra_dataset_registro_orden_uidx" ON "infra_dataset_registro" USING btree ("version_id","orden");--> statement-breakpoint
CREATE INDEX "infra_dataset_version_dataset_fecha_idx" ON "infra_dataset_version" USING btree ("dataset_id","creada_en");--> statement-breakpoint
CREATE FUNCTION infra_dataset_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Las versiones y registros de datasets son inmutables; crear una nueva version';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER infra_dataset_version_inmutable BEFORE UPDATE OR DELETE ON infra_dataset_version FOR EACH ROW EXECUTE FUNCTION infra_dataset_inmutable();
--> statement-breakpoint
CREATE TRIGGER infra_dataset_registro_inmutable BEFORE UPDATE OR DELETE ON infra_dataset_registro FOR EACH ROW EXECUTE FUNCTION infra_dataset_inmutable();
--> statement-breakpoint
CREATE FUNCTION infra_dataset_validar_publicacion() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE esperadas integer; reales bigint;
BEGIN
  SELECT filas INTO esperadas FROM infra_dataset_version WHERE id=NEW.version_id AND dataset_id=NEW.dataset_id;
  SELECT count(*) INTO reales FROM infra_dataset_registro WHERE version_id=NEW.version_id;
  IF esperadas IS NULL OR reales <> esperadas THEN
    RAISE EXCEPTION 'Dataset incompleto o version ajena al dataset';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER infra_dataset_publicacion_completa BEFORE INSERT OR UPDATE ON infra_dataset_publicacion FOR EACH ROW EXECUTE FUNCTION infra_dataset_validar_publicacion();
--> statement-breakpoint
CREATE FUNCTION infra_dataset_validar_orden() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE total integer;
BEGIN
  SELECT filas INTO total FROM infra_dataset_version WHERE id=NEW.version_id;
  IF total IS NULL OR NEW.orden < 0 OR NEW.orden >= total THEN
    RAISE EXCEPTION 'Registro fuera del rango de la version';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER infra_dataset_registro_rango BEFORE INSERT ON infra_dataset_registro FOR EACH ROW EXECUTE FUNCTION infra_dataset_validar_orden();
