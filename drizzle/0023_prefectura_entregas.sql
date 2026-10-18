CREATE TABLE "infra_dataset_entrega" (
	"version_id" text NOT NULL,
	"destino" text NOT NULL,
	"intentos" integer DEFAULT 0 NOT NULL,
	"proximo_intento" timestamp with time zone DEFAULT now() NOT NULL,
	"entregada_en" timestamp with time zone,
	"ultimo_error" text,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "infra_dataset_entrega_version_id_destino_pk" PRIMARY KEY("version_id","destino")
);
--> statement-breakpoint
ALTER TABLE "infra_dataset_entrega" ADD CONSTRAINT "infra_dataset_entrega_version_id_infra_dataset_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."infra_dataset_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "infra_dataset_entrega_pendiente_idx" ON "infra_dataset_entrega" USING btree ("destino","proximo_intento");