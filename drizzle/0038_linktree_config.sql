CREATE TABLE "linktree_config" (
	"id" integer PRIMARY KEY NOT NULL,
	"config" jsonb NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_por" text,
	CONSTRAINT "linktree_config_unica" CHECK ("linktree_config"."id" = 1)
);
