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
