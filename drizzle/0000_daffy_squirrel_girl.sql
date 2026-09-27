CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categorias" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"color" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazard_climatology" (
	"id" text PRIMARY KEY NOT NULL,
	"geometry_ref" text NOT NULL,
	"variable" text NOT NULL,
	"percentil" text NOT NULL,
	"muestra" text NOT NULL,
	"valor" real NOT NULL,
	"unidad" text NOT NULL,
	"periodo_desde" text NOT NULL,
	"periodo_hasta" text NOT NULL,
	"version" text NOT NULL,
	"calculado_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazard_ensemble_prob" (
	"id" text PRIMARY KEY NOT NULL,
	"geometry_ref" text NOT NULL,
	"variable" text NOT NULL,
	"corrida_en" text NOT NULL,
	"valido_en" text NOT NULL,
	"horizonte_horas" integer NOT NULL,
	"miembros_total" integer NOT NULL,
	"miembros_validos" integer NOT NULL,
	"probabilidad_p95" real NOT NULL,
	"probabilidad_p99" real NOT NULL,
	"dispersion" real NOT NULL,
	"version" text NOT NULL,
	"ingerido_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazard_forecast" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"variable" text NOT NULL,
	"geometry_ref" text NOT NULL,
	"corrida_en" text NOT NULL,
	"valido_en" text NOT NULL,
	"horizonte_horas" integer NOT NULL,
	"valor" real NOT NULL,
	"unidad" text NOT NULL,
	"paso_horas" integer NOT NULL,
	"raw_ref" text,
	"ingerido_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazard_observation" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"variable" text NOT NULL,
	"geometry_ref" text NOT NULL,
	"valor" real NOT NULL,
	"unidad" text NOT NULL,
	"observado_en" text NOT NULL,
	"valido_desde" text NOT NULL,
	"valido_hasta" text NOT NULL,
	"calidad" real,
	"raw_ref" text,
	"ingerido_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazard_seasonal_trend" (
	"id" text PRIMARY KEY NOT NULL,
	"departamento" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"variable" text NOT NULL,
	"emision_en" text NOT NULL,
	"valido_desde" text NOT NULL,
	"valido_hasta" text NOT NULL,
	"horizonte_desde_dias" integer NOT NULL,
	"horizonte_hasta_dias" integer NOT NULL,
	"miembros_total" integer NOT NULL,
	"miembros_validos" integer NOT NULL,
	"media_mm" real,
	"mediana_mm" real,
	"dispersion_mm" real,
	"probabilidad_sobre_normal" real,
	"version" text NOT NULL,
	"ingerido_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazard_source_health" (
	"provider" text PRIMARY KEY NOT NULL,
	"ultimo_exito_en" text,
	"ultimo_intento_en" text,
	"estado" text NOT NULL,
	"ultimo_error_saneado" text,
	"ttl_minutos" integer NOT NULL,
	"licencia" text NOT NULL,
	"actualizada_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infra_acceso_nominal_log" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"afectacion_id" text NOT NULL,
	"cantidad" integer NOT NULL,
	"consultado_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infra_afectacion" (
	"id" text PRIMARY KEY NOT NULL,
	"parte_id" text NOT NULL,
	"motivo" text NOT NULL,
	"categoria" text NOT NULL,
	"severidad" text NOT NULL,
	"descripcion" text,
	"rige_desde" text NOT NULL,
	"creada_en" text NOT NULL,
	"retirada_en" text
);
--> statement-breakpoint
CREATE TABLE "infra_afectacion_alumno" (
	"afectacion_id" text NOT NULL,
	"ge_person_id" integer NOT NULL,
	CONSTRAINT "infra_afectacion_alumno_afectacion_id_ge_person_id_pk" PRIMARY KEY("afectacion_id","ge_person_id")
);
--> statement-breakpoint
CREATE TABLE "infra_afectacion_seccion" (
	"afectacion_id" text NOT NULL,
	"ge_section_id" integer NOT NULL,
	CONSTRAINT "infra_afectacion_seccion_afectacion_id_ge_section_id_pk" PRIMARY KEY("afectacion_id","ge_section_id")
);
--> statement-breakpoint
CREATE TABLE "infra_aislamiento_osm" (
	"cue_anexo" text NOT NULL,
	"version_job" text NOT NULL,
	"distancia_via_pavimentada_m" real,
	"distancia_cabecera_departamental_m" real,
	"tramos_sin_pavimentar_count" integer,
	"cruces_agua_count" integer,
	"cruces_agua_con_puente_count" integer,
	"cruces_agua_con_vado_count" integer,
	"tiene_alternativa_sin_cruce" boolean,
	"indice_aislamiento" integer,
	"motivo_sin_datos" text,
	"snap_distancia_m" real,
	"fecha_extracto_osm" text NOT NULL,
	"licencia" text NOT NULL,
	"importado_en" text NOT NULL,
	CONSTRAINT "infra_aislamiento_osm_cue_anexo_version_job_pk" PRIMARY KEY("cue_anexo","version_job")
);
--> statement-breakpoint
CREATE TABLE "infra_briefing" (
	"id" text PRIMARY KEY NOT NULL,
	"corte_id" text NOT NULL,
	"modelo" text NOT NULL,
	"version_prompt" text NOT NULL,
	"parametros" jsonb,
	"salida_ia" jsonb,
	"texto_final" text NOT NULL,
	"fuente" text NOT NULL,
	"motivo_fallback" text,
	"tokens_entrada" integer,
	"tokens_salida" integer,
	"costo_usd" real,
	"latencia_ms" integer,
	"validacion" jsonb,
	"auditoria_fallback" jsonb,
	"creada_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infra_briefing_presupuesto_mes" (
	"mes" text PRIMARY KEY NOT NULL,
	"acumulado_usd" real NOT NULL,
	"actualizada_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infra_episodio_derivado" (
	"id" text PRIMARY KEY NOT NULL,
	"regla_version" text NOT NULL,
	"parametros" jsonb NOT NULL,
	"unidad_tipo" text NOT NULL,
	"unidad_id" text NOT NULL,
	"inicio_en" text NOT NULL,
	"fin_en" text,
	"estado" text NOT NULL,
	"escuelas_afectadas" integer NOT NULL,
	"calculado_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infra_episodio_miembro" (
	"id" text PRIMARY KEY NOT NULL,
	"episodio_derivado_id" text NOT NULL,
	"cue_anexo" text NOT NULL,
	"movimiento_id" text,
	"primera_afectacion_en" text NOT NULL,
	"recuperado_en" text
);
--> statement-breakpoint
CREATE TABLE "infra_geo_profile" (
	"cue_anexo" text PRIMARY KEY NOT NULL,
	"lat" real,
	"lon" real,
	"geo_calidad" text,
	"departamento" text,
	"geometry_ref" text,
	"motivo_exclusion" text,
	"perfil_version" text NOT NULL,
	"calculado_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infra_geo_rio" (
	"cue_anexo" text PRIMARY KEY NOT NULL,
	"punto_rio_id" text,
	"distancia_km" real,
	"radio_maximo_km" real NOT NULL,
	"version" text NOT NULL,
	"calculado_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infra_job_run" (
	"id" text PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"clave_idempotente" text NOT NULL,
	"intento" integer DEFAULT 1 NOT NULL,
	"iniciado_en" text NOT NULL,
	"finalizado_en" text,
	"estado" text NOT NULL,
	"contadores" jsonb,
	"error_saneado" text,
	"version" text NOT NULL,
	"lease_owner" text,
	"lease_expira_en" text,
	"creada_en" text NOT NULL,
	"actualizada_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infra_motivo" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"categoria" text NOT NULL,
	"orden" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infra_movimiento" (
	"id" text PRIMARY KEY NOT NULL,
	"parte_id" text NOT NULL,
	"tipo" text NOT NULL,
	"rol" text NOT NULL,
	"resumen" jsonb NOT NULL,
	"rige_desde" text NOT NULL,
	"creada_en" text NOT NULL,
	"idempotency_key" text
);
--> statement-breakpoint
CREATE TABLE "infra_parte" (
	"id" text PRIMARY KEY NOT NULL,
	"periodo_id" text NOT NULL,
	"cue_anexo" text NOT NULL,
	"estado_establecimiento" text DEFAULT 'habitual' NOT NULL,
	"estado_establecimiento_rige_desde" text NOT NULL,
	"corte_id" integer NOT NULL,
	"creada_en" text NOT NULL,
	"actualizada_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infra_periodo" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"inicio_en" text NOT NULL,
	"fin_en" text,
	"estado" text NOT NULL,
	"creada_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infra_permiso_nominal" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"otorgado_por" text NOT NULL,
	"otorgado_en" text NOT NULL,
	"vence_en" text NOT NULL,
	"revocado_en" text
);
--> statement-breakpoint
CREATE TABLE "infra_risk_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"tipo" text NOT NULL,
	"fuente" text NOT NULL,
	"variable" text NOT NULL,
	"valor" real,
	"unidad" text,
	"contribucion" real NOT NULL,
	"peso" real NOT NULL,
	"explicacion" text NOT NULL,
	"observado_en" text
);
--> statement-breakpoint
CREATE TABLE "infra_risk_run" (
	"id" text PRIMARY KEY NOT NULL,
	"periodo_id" text NOT NULL,
	"modelo_version" text NOT NULL,
	"iniciado_en" text NOT NULL,
	"publicado_en" text,
	"estado" text NOT NULL,
	"cobertura" jsonb,
	"creada_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infra_risk_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"cue_anexo" text NOT NULL,
	"horizonte_horas" integer NOT NULL,
	"evidencia_valida" boolean NOT NULL,
	"score_riesgo" real,
	"nivel_riesgo" text,
	"score_amenaza" real,
	"score_vulnerabilidad" real,
	"confianza" text NOT NULL,
	"score_riesgo_acceso" real,
	"nivel_riesgo_acceso" text,
	"confianza_acceso" text,
	"exposicion_matricula" integer,
	"exposicion_secciones" integer,
	"calculado_en" text NOT NULL,
	"valido_hasta" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infra_servicio_alcance" (
	"id" text PRIMARY KEY NOT NULL,
	"parte_id" text NOT NULL,
	"tipo" text NOT NULL,
	"referencia_id" text,
	"estado" text NOT NULL,
	"rige_desde" text NOT NULL,
	"creada_en" text NOT NULL,
	"retirada_en" text
);
--> statement-breakpoint
CREATE TABLE "infra_situacion_corte" (
	"id" text PRIMARY KEY NOT NULL,
	"generado_en" text NOT NULL,
	"risk_run_id" text,
	"cobertura" jsonb,
	"conteos_por_nivel_riesgo" jsonb NOT NULL,
	"kpis" jsonb NOT NULL,
	"fuentes_salud" jsonb NOT NULL,
	"episodios_abiertos" integer DEFAULT 0 NOT NULL,
	"episodios_cerrados_desde_anterior" integer DEFAULT 0 NOT NULL,
	"generado_por_job_run_id" text,
	"creada_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infra_susceptibilidad_estatica" (
	"cue_anexo" text NOT NULL,
	"version_job" text NOT NULL,
	"peligro_inundacion_fluvial" real,
	"peligro_inundacion_pluvial" real,
	"peligro_viento" real,
	"peligro_calor" real,
	"periodo_retorno_anios" integer NOT NULL,
	"fuente" text NOT NULL,
	"fecha_corrida" text NOT NULL,
	"licencia" text NOT NULL,
	"importado_en" text NOT NULL,
	CONSTRAINT "infra_susceptibilidad_estatica_cue_anexo_version_job_pk" PRIMARY KEY("cue_anexo","version_job")
);
--> statement-breakpoint
CREATE TABLE "infra_verificacion" (
	"id" text PRIMARY KEY NOT NULL,
	"periodo_id" text NOT NULL,
	"cue_anexo" text NOT NULL,
	"estado" text NOT NULL,
	"solicitada_en" text NOT NULL,
	"solicitada_por_user_id" text NOT NULL,
	"vencimiento_en" text,
	"resultado" text,
	"discrepancia" boolean DEFAULT false NOT NULL,
	"respondida_en" text,
	"respondida_canal" text,
	"respondida_por_user_id" text,
	"movimiento_id" text,
	"cancelada_en" text,
	"cancelada_por_user_id" text,
	"motivo_cancelacion" text,
	"token_hash" text NOT NULL,
	"token_expira_en" text NOT NULL,
	"token_revocado_en" text,
	"token_consumido_en" text,
	"creada_en" text NOT NULL,
	"actualizada_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "infra_verificacion_evento" (
	"id" text PRIMARY KEY NOT NULL,
	"verificacion_id" text NOT NULL,
	"tipo" text NOT NULL,
	"actor_tipo" text NOT NULL,
	"actor_user_id" text,
	"canal" text,
	"motivo" text,
	"correlacion_id" text,
	"creada_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "niveles" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"orden" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "om_cupo_contador" (
	"host" text NOT NULL,
	"ventana" text NOT NULL,
	"clave_ventana" text NOT NULL,
	"peso_acumulado" real NOT NULL,
	"actualizada_en" text NOT NULL,
	CONSTRAINT "om_cupo_contador_host_ventana_clave_ventana_pk" PRIMARY KEY("host","ventana","clave_ventana")
);
--> statement-breakpoint
CREATE TABLE "om_cupo_cooldown" (
	"host" text PRIMARY KEY NOT NULL,
	"host_origen" text NOT NULL,
	"hasta_en" text NOT NULL,
	"motivo_saneado" text NOT NULL,
	"retry_after_segundos" integer,
	"actualizada_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurso_audiencia_niveles" (
	"recurso_id" text NOT NULL,
	"nivel_id" text NOT NULL,
	CONSTRAINT "recurso_audiencia_niveles_recurso_id_nivel_id_pk" PRIMARY KEY("recurso_id","nivel_id")
);
--> statement-breakpoint
CREATE TABLE "recurso_audiencia_usuarios" (
	"recurso_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "recurso_audiencia_usuarios_recurso_id_user_id_pk" PRIMARY KEY("recurso_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "recurso_tags" (
	"recurso_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "recurso_tags_recurso_id_tag_id_pk" PRIMARY KEY("recurso_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "recursos" (
	"id" text PRIMARY KEY NOT NULL,
	"titulo" text NOT NULL,
	"descripcion" text NOT NULL,
	"formato" text NOT NULL,
	"nivel_id" text NOT NULL,
	"tipo_id" text NOT NULL,
	"categoria_id" text NOT NULL,
	"area" text NOT NULL,
	"actualizado" text NOT NULL,
	"estado" text NOT NULL,
	"ruta" text,
	"storage_key" text,
	"mime" text,
	"nombre_original" text,
	"size" integer
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tipos" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"aplica_a" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"role" text,
	"banned" boolean DEFAULT false,
	"ban_reason" text,
	"ban_expires" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "user_niveles" (
	"user_id" text NOT NULL,
	"nivel_id" text NOT NULL,
	CONSTRAINT "user_niveles_user_id_nivel_id_pk" PRIMARY KEY("user_id","nivel_id")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_afectacion" ADD CONSTRAINT "infra_afectacion_parte_id_infra_parte_id_fk" FOREIGN KEY ("parte_id") REFERENCES "public"."infra_parte"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_afectacion_alumno" ADD CONSTRAINT "infra_afectacion_alumno_afectacion_id_infra_afectacion_id_fk" FOREIGN KEY ("afectacion_id") REFERENCES "public"."infra_afectacion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_afectacion_seccion" ADD CONSTRAINT "infra_afectacion_seccion_afectacion_id_infra_afectacion_id_fk" FOREIGN KEY ("afectacion_id") REFERENCES "public"."infra_afectacion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_briefing" ADD CONSTRAINT "infra_briefing_corte_id_infra_situacion_corte_id_fk" FOREIGN KEY ("corte_id") REFERENCES "public"."infra_situacion_corte"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_episodio_miembro" ADD CONSTRAINT "infra_episodio_miembro_episodio_derivado_id_infra_episodio_derivado_id_fk" FOREIGN KEY ("episodio_derivado_id") REFERENCES "public"."infra_episodio_derivado"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_episodio_miembro" ADD CONSTRAINT "infra_episodio_miembro_movimiento_id_infra_movimiento_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."infra_movimiento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_movimiento" ADD CONSTRAINT "infra_movimiento_parte_id_infra_parte_id_fk" FOREIGN KEY ("parte_id") REFERENCES "public"."infra_parte"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_parte" ADD CONSTRAINT "infra_parte_periodo_id_infra_periodo_id_fk" FOREIGN KEY ("periodo_id") REFERENCES "public"."infra_periodo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_risk_factor" ADD CONSTRAINT "infra_risk_factor_snapshot_id_infra_risk_snapshot_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."infra_risk_snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_risk_run" ADD CONSTRAINT "infra_risk_run_periodo_id_infra_periodo_id_fk" FOREIGN KEY ("periodo_id") REFERENCES "public"."infra_periodo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_risk_snapshot" ADD CONSTRAINT "infra_risk_snapshot_run_id_infra_risk_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."infra_risk_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_servicio_alcance" ADD CONSTRAINT "infra_servicio_alcance_parte_id_infra_parte_id_fk" FOREIGN KEY ("parte_id") REFERENCES "public"."infra_parte"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_situacion_corte" ADD CONSTRAINT "infra_situacion_corte_risk_run_id_infra_risk_run_id_fk" FOREIGN KEY ("risk_run_id") REFERENCES "public"."infra_risk_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_situacion_corte" ADD CONSTRAINT "infra_situacion_corte_generado_por_job_run_id_infra_job_run_id_fk" FOREIGN KEY ("generado_por_job_run_id") REFERENCES "public"."infra_job_run"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_verificacion" ADD CONSTRAINT "infra_verificacion_periodo_id_infra_periodo_id_fk" FOREIGN KEY ("periodo_id") REFERENCES "public"."infra_periodo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_verificacion" ADD CONSTRAINT "infra_verificacion_movimiento_id_infra_movimiento_id_fk" FOREIGN KEY ("movimiento_id") REFERENCES "public"."infra_movimiento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infra_verificacion_evento" ADD CONSTRAINT "infra_verificacion_evento_verificacion_id_infra_verificacion_id_fk" FOREIGN KEY ("verificacion_id") REFERENCES "public"."infra_verificacion"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurso_audiencia_niveles" ADD CONSTRAINT "recurso_audiencia_niveles_recurso_id_recursos_id_fk" FOREIGN KEY ("recurso_id") REFERENCES "public"."recursos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurso_audiencia_niveles" ADD CONSTRAINT "recurso_audiencia_niveles_nivel_id_niveles_id_fk" FOREIGN KEY ("nivel_id") REFERENCES "public"."niveles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurso_audiencia_usuarios" ADD CONSTRAINT "recurso_audiencia_usuarios_recurso_id_recursos_id_fk" FOREIGN KEY ("recurso_id") REFERENCES "public"."recursos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurso_tags" ADD CONSTRAINT "recurso_tags_recurso_id_recursos_id_fk" FOREIGN KEY ("recurso_id") REFERENCES "public"."recursos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurso_tags" ADD CONSTRAINT "recurso_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recursos" ADD CONSTRAINT "recursos_nivel_id_niveles_id_fk" FOREIGN KEY ("nivel_id") REFERENCES "public"."niveles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recursos" ADD CONSTRAINT "recursos_tipo_id_tipos_id_fk" FOREIGN KEY ("tipo_id") REFERENCES "public"."tipos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recursos" ADD CONSTRAINT "recursos_categoria_id_categorias_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_niveles" ADD CONSTRAINT "user_niveles_nivel_id_niveles_id_fk" FOREIGN KEY ("nivel_id") REFERENCES "public"."niveles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_issuer_accountId_uidx" ON "account" USING btree ("issuer","account_id");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "hazard_climatology_uidx" ON "hazard_climatology" USING btree ("geometry_ref","variable","percentil","muestra","periodo_desde","periodo_hasta","version");--> statement-breakpoint
CREATE INDEX "hazard_climatology_geometry_ref_idx" ON "hazard_climatology" USING btree ("geometry_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "hazard_ensemble_prob_uidx" ON "hazard_ensemble_prob" USING btree ("geometry_ref","variable","corrida_en","valido_en");--> statement-breakpoint
CREATE INDEX "hazard_ensemble_prob_geometry_ref_idx" ON "hazard_ensemble_prob" USING btree ("geometry_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "hazard_forecast_uidx" ON "hazard_forecast" USING btree ("provider","variable","geometry_ref","corrida_en","valido_en");--> statement-breakpoint
CREATE INDEX "hazard_forecast_geometry_ref_idx" ON "hazard_forecast" USING btree ("geometry_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "hazard_observation_uidx" ON "hazard_observation" USING btree ("provider","variable","geometry_ref","observado_en");--> statement-breakpoint
CREATE INDEX "hazard_observation_geometry_ref_idx" ON "hazard_observation" USING btree ("geometry_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "hazard_seasonal_trend_uidx" ON "hazard_seasonal_trend" USING btree ("departamento","variable","emision_en","horizonte_desde_dias","horizonte_hasta_dias");--> statement-breakpoint
CREATE INDEX "hazard_seasonal_trend_departamento_idx" ON "hazard_seasonal_trend" USING btree ("departamento");--> statement-breakpoint
CREATE INDEX "infra_afectacion_parte_id_idx" ON "infra_afectacion" USING btree ("parte_id");--> statement-breakpoint
CREATE INDEX "infra_afectacion_creada_en_idx_e7b" ON "infra_afectacion" USING btree ("creada_en");--> statement-breakpoint
CREATE INDEX "infra_afectacion_rige_desde_idx_e7b" ON "infra_afectacion" USING btree ("rige_desde");--> statement-breakpoint
CREATE INDEX "infra_aislamiento_osm_indice_idx" ON "infra_aislamiento_osm" USING btree ("indice_aislamiento");--> statement-breakpoint
CREATE UNIQUE INDEX "infra_briefing_corte_uidx" ON "infra_briefing" USING btree ("corte_id");--> statement-breakpoint
CREATE INDEX "infra_briefing_creada_en_idx" ON "infra_briefing" USING btree ("creada_en");--> statement-breakpoint
CREATE INDEX "infra_episodio_derivado_unidad_idx" ON "infra_episodio_derivado" USING btree ("unidad_tipo","unidad_id");--> statement-breakpoint
CREATE INDEX "infra_episodio_derivado_regla_version_idx" ON "infra_episodio_derivado" USING btree ("regla_version");--> statement-breakpoint
CREATE INDEX "infra_episodio_derivado_estado_idx" ON "infra_episodio_derivado" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "infra_episodio_miembro_episodio_id_idx" ON "infra_episodio_miembro" USING btree ("episodio_derivado_id");--> statement-breakpoint
CREATE INDEX "infra_episodio_miembro_cue_anexo_idx" ON "infra_episodio_miembro" USING btree ("cue_anexo");--> statement-breakpoint
CREATE INDEX "infra_geo_profile_departamento_idx" ON "infra_geo_profile" USING btree ("departamento");--> statement-breakpoint
CREATE UNIQUE INDEX "infra_job_run_clave_uidx" ON "infra_job_run" USING btree ("tipo","clave_idempotente");--> statement-breakpoint
CREATE INDEX "infra_job_run_estado_idx" ON "infra_job_run" USING btree ("estado");--> statement-breakpoint
CREATE INDEX "infra_movimiento_parte_id_idx" ON "infra_movimiento" USING btree ("parte_id");--> statement-breakpoint
CREATE UNIQUE INDEX "infra_movimiento_idempotency_key_uidx" ON "infra_movimiento" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "infra_parte_cue_periodo_uidx" ON "infra_parte" USING btree ("cue_anexo","periodo_id");--> statement-breakpoint
CREATE INDEX "infra_parte_periodo_id_idx" ON "infra_parte" USING btree ("periodo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "infra_periodo_vigente_unico" ON "infra_periodo" USING btree ("estado") WHERE "infra_periodo"."estado" = 'vigente';--> statement-breakpoint
CREATE INDEX "infra_risk_factor_snapshot_id_idx" ON "infra_risk_factor" USING btree ("snapshot_id");--> statement-breakpoint
CREATE UNIQUE INDEX "infra_risk_run_vigente_unico" ON "infra_risk_run" USING btree ("estado") WHERE "infra_risk_run"."estado" = 'vigente';--> statement-breakpoint
CREATE INDEX "infra_risk_run_periodo_id_idx" ON "infra_risk_run" USING btree ("periodo_id");--> statement-breakpoint
CREATE INDEX "infra_risk_run_publicado_en_idx_e7b" ON "infra_risk_run" USING btree ("publicado_en");--> statement-breakpoint
CREATE UNIQUE INDEX "infra_risk_snapshot_uidx" ON "infra_risk_snapshot" USING btree ("run_id","cue_anexo","horizonte_horas");--> statement-breakpoint
CREATE INDEX "infra_risk_snapshot_cue_anexo_idx" ON "infra_risk_snapshot" USING btree ("cue_anexo");--> statement-breakpoint
CREATE INDEX "infra_risk_snapshot_run_id_idx" ON "infra_risk_snapshot" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "infra_servicio_alcance_parte_id_idx" ON "infra_servicio_alcance" USING btree ("parte_id");--> statement-breakpoint
CREATE INDEX "infra_situacion_corte_generado_en_idx" ON "infra_situacion_corte" USING btree ("generado_en");--> statement-breakpoint
CREATE INDEX "infra_situacion_corte_risk_run_id_idx" ON "infra_situacion_corte" USING btree ("risk_run_id");--> statement-breakpoint
CREATE INDEX "infra_verificacion_periodo_id_idx" ON "infra_verificacion" USING btree ("periodo_id");--> statement-breakpoint
CREATE INDEX "infra_verificacion_cue_anexo_idx" ON "infra_verificacion" USING btree ("cue_anexo");--> statement-breakpoint
CREATE INDEX "infra_verificacion_estado_idx" ON "infra_verificacion" USING btree ("estado");--> statement-breakpoint
CREATE UNIQUE INDEX "infra_verificacion_token_hash_uidx" ON "infra_verificacion" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "infra_verificacion_evento_verificacion_id_idx" ON "infra_verificacion_evento" USING btree ("verificacion_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");