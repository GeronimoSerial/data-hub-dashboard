CREATE TABLE "links_sesiones" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario" text NOT NULL,
	"credencial_hash" text NOT NULL,
	"expira" timestamp with time zone NOT NULL,
	"revocada" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "linktree_config" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;