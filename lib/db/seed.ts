import { count, eq } from 'drizzle-orm'
import {
  categorias as seedCategorias,
  niveles as seedNiveles,
  recursos as seedRecursos,
  tags as seedTags,
  tipos as seedTipos,
  type Recurso,
} from '@/lib/model'
import {
  SEED_PUBLIC_FILES,
  copySeedPublicFile,
  shouldReplaceWithSeedFile,
} from '@/lib/seed-files'
import { getDb } from './index'
import { conReintentoPorBloqueo } from './reintento'
import {
  categorias,
  infraPeriodo,
  niveles,
  recursoTags,
  recursos,
  tags,
  tipos,
  user,
} from './schema'
import { upsertRecursoInfraestructura } from '@/lib/infraestructura/recurso-seed'
import { ensureLocalizacionesSeeded } from '@/lib/infraestructura/localizaciones-seed'
import {
  ensureMotivoNombreUnico,
  sembrarMotivos,
} from '@/lib/infraestructura/motivos'

// Exportado únicamente para el test de regresión de lib/db/seed.test.ts, que
// lo aplica sobre una base ya poblada y verifica que no pierde filas ni
// duplica nada al correr dos veces. No es un punto de extensión: seguí
// agregando tablas acá mismo, nunca en un segundo bloque de DDL.
export const HUB_DDL = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS \`niveles\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`nombre\` text NOT NULL,
  \`orden\` integer NOT NULL
);
CREATE TABLE IF NOT EXISTS \`tipos\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`nombre\` text NOT NULL,
  \`aplica_a\` text NOT NULL
);
CREATE TABLE IF NOT EXISTS \`categorias\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`nombre\` text NOT NULL,
  \`color\` text NOT NULL
);
CREATE TABLE IF NOT EXISTS \`tags\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`nombre\` text NOT NULL
);
CREATE TABLE IF NOT EXISTS \`recursos\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`titulo\` text NOT NULL,
  \`descripcion\` text NOT NULL,
  \`formato\` text NOT NULL,
  \`nivel_id\` text NOT NULL,
  \`tipo_id\` text NOT NULL,
  \`categoria_id\` text NOT NULL,
  \`area\` text NOT NULL,
  \`actualizado\` text NOT NULL,
  \`estado\` text NOT NULL,
  \`ruta\` text,
  \`storage_key\` text,
  \`mime\` text,
  \`nombre_original\` text,
  \`size\` integer,
  FOREIGN KEY (\`nivel_id\`) REFERENCES \`niveles\`(\`id\`),
  FOREIGN KEY (\`tipo_id\`) REFERENCES \`tipos\`(\`id\`),
  FOREIGN KEY (\`categoria_id\`) REFERENCES \`categorias\`(\`id\`)
);
CREATE TABLE IF NOT EXISTS \`recurso_tags\` (
  \`recurso_id\` text NOT NULL,
  \`tag_id\` text NOT NULL,
  PRIMARY KEY(\`recurso_id\`, \`tag_id\`),
  FOREIGN KEY (\`recurso_id\`) REFERENCES \`recursos\`(\`id\`) ON DELETE CASCADE,
  FOREIGN KEY (\`tag_id\`) REFERENCES \`tags\`(\`id\`)
);
CREATE TABLE IF NOT EXISTS \`recurso_audiencia_niveles\` (
  \`recurso_id\` text NOT NULL,
  \`nivel_id\` text NOT NULL,
  PRIMARY KEY(\`recurso_id\`, \`nivel_id\`),
  FOREIGN KEY (\`recurso_id\`) REFERENCES \`recursos\`(\`id\`) ON DELETE CASCADE,
  FOREIGN KEY (\`nivel_id\`) REFERENCES \`niveles\`(\`id\`)
);
CREATE TABLE IF NOT EXISTS \`recurso_audiencia_usuarios\` (
  \`recurso_id\` text NOT NULL,
  \`user_id\` text NOT NULL,
  PRIMARY KEY(\`recurso_id\`, \`user_id\`),
  FOREIGN KEY (\`recurso_id\`) REFERENCES \`recursos\`(\`id\`) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS \`user\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`name\` text NOT NULL,
  \`email\` text NOT NULL,
  \`email_verified\` integer DEFAULT 0 NOT NULL,
  \`image\` text,
  \`created_at\` integer NOT NULL,
  \`updated_at\` integer NOT NULL,
  \`role\` text,
  \`banned\` integer DEFAULT 0,
  \`ban_reason\` text,
  \`ban_expires\` integer
);
CREATE UNIQUE INDEX IF NOT EXISTS \`user_email_unique\` ON \`user\` (\`email\`);
CREATE TABLE IF NOT EXISTS \`session\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`expires_at\` integer NOT NULL,
  \`token\` text NOT NULL,
  \`created_at\` integer NOT NULL,
  \`updated_at\` integer NOT NULL,
  \`ip_address\` text,
  \`user_agent\` text,
  \`user_id\` text NOT NULL,
  \`impersonated_by\` text,
  FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS \`session_token_unique\` ON \`session\` (\`token\`);
CREATE INDEX IF NOT EXISTS \`session_userId_idx\` ON \`session\` (\`user_id\`);
CREATE TABLE IF NOT EXISTS \`account\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`issuer\` text NOT NULL,
  \`account_id\` text NOT NULL,
  \`provider_id\` text NOT NULL,
  \`user_id\` text NOT NULL,
  \`access_token\` text,
  \`refresh_token\` text,
  \`id_token\` text,
  \`access_token_expires_at\` integer,
  \`refresh_token_expires_at\` integer,
  \`scope\` text,
  \`password\` text,
  \`created_at\` integer NOT NULL,
  \`updated_at\` integer NOT NULL,
  FOREIGN KEY (\`user_id\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS \`account_issuer_accountId_uidx\` ON \`account\` (\`issuer\`, \`account_id\`);
CREATE INDEX IF NOT EXISTS \`account_userId_idx\` ON \`account\` (\`user_id\`);
CREATE TABLE IF NOT EXISTS \`verification\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`identifier\` text NOT NULL,
  \`value\` text NOT NULL,
  \`expires_at\` integer NOT NULL,
  \`created_at\` integer NOT NULL,
  \`updated_at\` integer NOT NULL
);
CREATE INDEX IF NOT EXISTS \`verification_identifier_idx\` ON \`verification\` (\`identifier\`);
CREATE TABLE IF NOT EXISTS \`user_niveles\` (
  \`user_id\` text NOT NULL,
  \`nivel_id\` text NOT NULL,
  PRIMARY KEY(\`user_id\`, \`nivel_id\`),
  FOREIGN KEY (\`nivel_id\`) REFERENCES \`niveles\`(\`id\`)
);
CREATE TABLE IF NOT EXISTS \`infra_permiso_nominal\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`user_id\` text NOT NULL,
  \`otorgado_por\` text NOT NULL,
  \`otorgado_en\` text NOT NULL,
  \`vence_en\` text NOT NULL,
  \`revocado_en\` text
);
CREATE INDEX IF NOT EXISTS \`infra_permiso_nominal_user_id_idx\` ON \`infra_permiso_nominal\` (\`user_id\`);
CREATE TABLE IF NOT EXISTS \`infra_acceso_nominal_log\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`user_id\` text NOT NULL,
  \`afectacion_id\` text NOT NULL,
  \`cantidad\` integer NOT NULL,
  \`consultado_en\` text NOT NULL
);
CREATE TABLE IF NOT EXISTS \`infra_motivo\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`nombre\` text NOT NULL,
  \`categoria\` text NOT NULL,
  \`orden\` integer DEFAULT 0 NOT NULL
);
CREATE TABLE IF NOT EXISTS \`infra_periodo\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`nombre\` text NOT NULL,
  \`inicio_en\` text NOT NULL,
  \`fin_en\` text,
  \`estado\` text NOT NULL,
  \`creada_en\` text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`infra_periodo_vigente_unico\` ON \`infra_periodo\` (\`estado\`) WHERE \`estado\` = 'vigente';
CREATE TABLE IF NOT EXISTS \`infra_parte\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`periodo_id\` text NOT NULL,
  \`cue_anexo\` text NOT NULL,
  \`estado_establecimiento\` text DEFAULT 'habitual' NOT NULL,
  \`estado_establecimiento_rige_desde\` text NOT NULL,
  \`corte_id\` integer NOT NULL,
  \`creada_en\` text NOT NULL,
  \`actualizada_en\` text NOT NULL,
  FOREIGN KEY (\`periodo_id\`) REFERENCES \`infra_periodo\`(\`id\`)
);
CREATE UNIQUE INDEX IF NOT EXISTS \`infra_parte_cue_periodo_uidx\` ON \`infra_parte\` (\`cue_anexo\`, \`periodo_id\`);
CREATE INDEX IF NOT EXISTS \`infra_parte_periodo_id_idx\` ON \`infra_parte\` (\`periodo_id\`);
CREATE TABLE IF NOT EXISTS \`infra_afectacion\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`parte_id\` text NOT NULL,
  \`motivo\` text NOT NULL,
  \`categoria\` text NOT NULL,
  \`severidad\` text NOT NULL,
  \`descripcion\` text,
  \`rige_desde\` text NOT NULL,
  \`creada_en\` text NOT NULL,
  \`retirada_en\` text,
  FOREIGN KEY (\`parte_id\`) REFERENCES \`infra_parte\`(\`id\`) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS \`infra_afectacion_parte_id_idx\` ON \`infra_afectacion\` (\`parte_id\`);
CREATE TABLE IF NOT EXISTS \`infra_afectacion_seccion\` (
  \`afectacion_id\` text NOT NULL,
  \`ge_section_id\` integer NOT NULL,
  PRIMARY KEY(\`afectacion_id\`, \`ge_section_id\`),
  FOREIGN KEY (\`afectacion_id\`) REFERENCES \`infra_afectacion\`(\`id\`) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS \`infra_afectacion_alumno\` (
  \`afectacion_id\` text NOT NULL,
  \`ge_person_id\` integer NOT NULL,
  PRIMARY KEY(\`afectacion_id\`, \`ge_person_id\`),
  FOREIGN KEY (\`afectacion_id\`) REFERENCES \`infra_afectacion\`(\`id\`) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS \`infra_servicio_alcance\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`parte_id\` text NOT NULL,
  \`tipo\` text NOT NULL,
  \`referencia_id\` text,
  \`estado\` text NOT NULL,
  \`rige_desde\` text NOT NULL,
  \`creada_en\` text NOT NULL,
  \`retirada_en\` text,
  FOREIGN KEY (\`parte_id\`) REFERENCES \`infra_parte\`(\`id\`) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS \`infra_servicio_alcance_parte_id_idx\` ON \`infra_servicio_alcance\` (\`parte_id\`);
CREATE TABLE IF NOT EXISTS \`infra_movimiento\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`parte_id\` text NOT NULL,
  \`tipo\` text NOT NULL,
  \`rol\` text NOT NULL,
  \`resumen\` text NOT NULL,
  \`rige_desde\` text NOT NULL,
  \`creada_en\` text NOT NULL,
  \`idempotency_key\` text,
  FOREIGN KEY (\`parte_id\`) REFERENCES \`infra_parte\`(\`id\`) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS \`infra_movimiento_parte_id_idx\` ON \`infra_movimiento\` (\`parte_id\`);
CREATE TABLE IF NOT EXISTS \`infra_verificacion\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`periodo_id\` text NOT NULL,
  \`cue_anexo\` text NOT NULL,
  \`estado\` text NOT NULL,
  \`solicitada_en\` text NOT NULL,
  \`solicitada_por_user_id\` text NOT NULL,
  \`vencimiento_en\` text,
  \`resultado\` text,
  \`discrepancia\` integer DEFAULT 0 NOT NULL,
  \`respondida_en\` text,
  \`respondida_canal\` text,
  \`respondida_por_user_id\` text,
  \`movimiento_id\` text,
  \`cancelada_en\` text,
  \`cancelada_por_user_id\` text,
  \`motivo_cancelacion\` text,
  \`token_hash\` text NOT NULL,
  \`token_expira_en\` text NOT NULL,
  \`token_revocado_en\` text,
  \`token_consumido_en\` text,
  \`creada_en\` text NOT NULL,
  \`actualizada_en\` text NOT NULL,
  FOREIGN KEY (\`periodo_id\`) REFERENCES \`infra_periodo\`(\`id\`),
  FOREIGN KEY (\`movimiento_id\`) REFERENCES \`infra_movimiento\`(\`id\`)
);
CREATE INDEX IF NOT EXISTS \`infra_verificacion_cue_anexo_idx\` ON \`infra_verificacion\` (\`cue_anexo\`);
CREATE INDEX IF NOT EXISTS \`infra_verificacion_estado_idx\` ON \`infra_verificacion\` (\`estado\`);
CREATE UNIQUE INDEX IF NOT EXISTS \`infra_verificacion_token_hash_uidx\` ON \`infra_verificacion\` (\`token_hash\`);
CREATE TABLE IF NOT EXISTS \`infra_verificacion_evento\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`verificacion_id\` text NOT NULL,
  \`tipo\` text NOT NULL,
  \`actor_tipo\` text NOT NULL,
  \`actor_user_id\` text,
  \`canal\` text,
  \`motivo\` text,
  \`correlacion_id\` text,
  \`creada_en\` text NOT NULL,
  FOREIGN KEY (\`verificacion_id\`) REFERENCES \`infra_verificacion\`(\`id\`) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS \`infra_verificacion_evento_verificacion_id_idx\` ON \`infra_verificacion_evento\` (\`verificacion_id\`);
CREATE TABLE IF NOT EXISTS \`infra_job_run\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`tipo\` text NOT NULL,
  \`clave_idempotente\` text NOT NULL,
  \`intento\` integer DEFAULT 1 NOT NULL,
  \`iniciado_en\` text NOT NULL,
  \`finalizado_en\` text,
  \`estado\` text NOT NULL,
  \`contadores\` text,
  \`error_saneado\` text,
  \`version\` text NOT NULL,
  \`lease_owner\` text,
  \`lease_expira_en\` text,
  \`creada_en\` text NOT NULL,
  \`actualizada_en\` text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`infra_job_run_clave_uidx\` ON \`infra_job_run\` (\`tipo\`, \`clave_idempotente\`);
CREATE INDEX IF NOT EXISTS \`infra_job_run_estado_idx\` ON \`infra_job_run\` (\`estado\`);
CREATE TABLE IF NOT EXISTS \`infra_geo_profile\` (
  \`cue_anexo\` text PRIMARY KEY NOT NULL,
  \`lat\` real,
  \`lon\` real,
  \`geo_calidad\` text,
  \`departamento\` text,
  \`geometry_ref\` text,
  \`motivo_exclusion\` text,
  \`perfil_version\` text NOT NULL,
  \`calculado_en\` text NOT NULL
);
CREATE INDEX IF NOT EXISTS \`infra_geo_profile_departamento_idx\` ON \`infra_geo_profile\` (\`departamento\`);
CREATE TABLE IF NOT EXISTS \`hazard_forecast\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`provider\` text NOT NULL,
  \`variable\` text NOT NULL,
  \`geometry_ref\` text NOT NULL,
  \`corrida_en\` text NOT NULL,
  \`valido_en\` text NOT NULL,
  \`horizonte_horas\` integer NOT NULL,
  \`valor\` real NOT NULL,
  \`unidad\` text NOT NULL,
  \`paso_horas\` integer NOT NULL,
  \`raw_ref\` text,
  \`ingerido_en\` text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`hazard_forecast_uidx\` ON \`hazard_forecast\` (\`provider\`, \`variable\`, \`geometry_ref\`, \`corrida_en\`, \`valido_en\`);
CREATE INDEX IF NOT EXISTS \`hazard_forecast_geometry_ref_idx\` ON \`hazard_forecast\` (\`geometry_ref\`);
CREATE TABLE IF NOT EXISTS \`hazard_climatology\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`geometry_ref\` text NOT NULL,
  \`variable\` text NOT NULL,
  \`percentil\` text NOT NULL,
  \`muestra\` text NOT NULL,
  \`valor\` real NOT NULL,
  \`unidad\` text NOT NULL,
  \`periodo_desde\` text NOT NULL,
  \`periodo_hasta\` text NOT NULL,
  \`version\` text NOT NULL,
  \`calculado_en\` text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`hazard_climatology_uidx\` ON \`hazard_climatology\` (\`geometry_ref\`, \`variable\`, \`percentil\`, \`muestra\`, \`periodo_desde\`, \`periodo_hasta\`, \`version\`);
CREATE INDEX IF NOT EXISTS \`hazard_climatology_geometry_ref_idx\` ON \`hazard_climatology\` (\`geometry_ref\`);
CREATE TABLE IF NOT EXISTS \`hazard_source_health\` (
  \`provider\` text PRIMARY KEY NOT NULL,
  \`ultimo_exito_en\` text,
  \`ultimo_intento_en\` text,
  \`estado\` text NOT NULL,
  \`ultimo_error_saneado\` text,
  \`ttl_minutos\` integer NOT NULL,
  \`licencia\` text NOT NULL,
  \`actualizada_en\` text NOT NULL
);
-- E3b: motor de riesgo v0 (infra_risk_run, infra_risk_snapshot, infra_risk_factor)
CREATE TABLE IF NOT EXISTS \`infra_risk_run\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`periodo_id\` text NOT NULL,
  \`modelo_version\` text NOT NULL,
  \`iniciado_en\` text NOT NULL,
  \`publicado_en\` text,
  \`estado\` text NOT NULL,
  \`cobertura\` text,
  \`creada_en\` text NOT NULL,
  FOREIGN KEY (\`periodo_id\`) REFERENCES \`infra_periodo\`(\`id\`)
);
CREATE UNIQUE INDEX IF NOT EXISTS \`infra_risk_run_vigente_unico\` ON \`infra_risk_run\` (\`estado\`) WHERE \`estado\` = 'vigente';
CREATE INDEX IF NOT EXISTS \`infra_risk_run_periodo_id_idx\` ON \`infra_risk_run\` (\`periodo_id\`);
CREATE TABLE IF NOT EXISTS \`infra_risk_snapshot\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`run_id\` text NOT NULL,
  \`cue_anexo\` text NOT NULL,
  \`horizonte_horas\` integer NOT NULL,
  \`evidencia_valida\` integer NOT NULL,
  \`score_riesgo\` real,
  \`nivel_riesgo\` text,
  \`score_amenaza\` real,
  \`score_vulnerabilidad\` real,
  \`confianza\` text NOT NULL,
  \`exposicion_matricula\` integer,
  \`exposicion_secciones\` integer,
  \`calculado_en\` text NOT NULL,
  \`valido_hasta\` text NOT NULL,
  FOREIGN KEY (\`run_id\`) REFERENCES \`infra_risk_run\`(\`id\`)
);
CREATE UNIQUE INDEX IF NOT EXISTS \`infra_risk_snapshot_uidx\` ON \`infra_risk_snapshot\` (\`run_id\`, \`cue_anexo\`, \`horizonte_horas\`);
CREATE INDEX IF NOT EXISTS \`infra_risk_snapshot_cue_anexo_idx\` ON \`infra_risk_snapshot\` (\`cue_anexo\`);
CREATE INDEX IF NOT EXISTS \`infra_risk_snapshot_run_id_idx\` ON \`infra_risk_snapshot\` (\`run_id\`);
CREATE TABLE IF NOT EXISTS \`infra_risk_factor\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`snapshot_id\` text NOT NULL,
  \`tipo\` text NOT NULL,
  \`fuente\` text NOT NULL,
  \`variable\` text NOT NULL,
  \`valor\` real,
  \`unidad\` text,
  \`contribucion\` real NOT NULL,
  \`peso\` real NOT NULL,
  \`explicacion\` text NOT NULL,
  \`observado_en\` text,
  FOREIGN KEY (\`snapshot_id\`) REFERENCES \`infra_risk_snapshot\`(\`id\`) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS \`infra_risk_factor_snapshot_id_idx\` ON \`infra_risk_factor\` (\`snapshot_id\`);
-- E3a: señales v2 y capa de peligro estimado (ver docs/ejecucion-enos/E3a/registro.md)
CREATE TABLE IF NOT EXISTS \`infra_geo_rio\` (
  \`cue_anexo\` text PRIMARY KEY NOT NULL,
  \`punto_rio_id\` text,
  \`distancia_km\` real,
  \`radio_maximo_km\` real NOT NULL,
  \`version\` text NOT NULL,
  \`calculado_en\` text NOT NULL
);
CREATE TABLE IF NOT EXISTS \`hazard_ensemble_prob\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`geometry_ref\` text NOT NULL,
  \`variable\` text NOT NULL,
  \`corrida_en\` text NOT NULL,
  \`valido_en\` text NOT NULL,
  \`horizonte_horas\` integer NOT NULL,
  \`miembros_total\` integer NOT NULL,
  \`miembros_validos\` integer NOT NULL,
  \`probabilidad_p95\` real NOT NULL,
  \`probabilidad_p99\` real NOT NULL,
  \`dispersion\` real NOT NULL,
  \`version\` text NOT NULL,
  \`ingerido_en\` text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`hazard_ensemble_prob_uidx\` ON \`hazard_ensemble_prob\` (\`geometry_ref\`, \`variable\`, \`corrida_en\`, \`valido_en\`);
CREATE INDEX IF NOT EXISTS \`hazard_ensemble_prob_geometry_ref_idx\` ON \`hazard_ensemble_prob\` (\`geometry_ref\`);
CREATE TABLE IF NOT EXISTS \`hazard_observation\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`provider\` text NOT NULL,
  \`variable\` text NOT NULL,
  \`geometry_ref\` text NOT NULL,
  \`valor\` real NOT NULL,
  \`unidad\` text NOT NULL,
  \`observado_en\` text NOT NULL,
  \`valido_desde\` text NOT NULL,
  \`valido_hasta\` text NOT NULL,
  \`calidad\` real,
  \`raw_ref\` text,
  \`ingerido_en\` text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`hazard_observation_uidx\` ON \`hazard_observation\` (\`provider\`, \`variable\`, \`geometry_ref\`, \`observado_en\`);
CREATE INDEX IF NOT EXISTS \`hazard_observation_geometry_ref_idx\` ON \`hazard_observation\` (\`geometry_ref\`);
-- E7a: episodios derivados (calculados automáticamente)
CREATE TABLE IF NOT EXISTS \`infra_episodio_derivado\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`regla_version\` text NOT NULL,
  \`parametros\` text NOT NULL,
  \`unidad_tipo\` text NOT NULL,
  \`unidad_id\` text NOT NULL,
  \`inicio_en\` text NOT NULL,
  \`fin_en\` text,
  \`estado\` text NOT NULL,
  \`escuelas_afectadas\` integer NOT NULL,
  \`calculado_en\` text NOT NULL
);
CREATE INDEX IF NOT EXISTS \`infra_episodio_derivado_unidad_idx\` ON \`infra_episodio_derivado\` (\`unidad_tipo\`, \`unidad_id\`);
CREATE INDEX IF NOT EXISTS \`infra_episodio_derivado_regla_version_idx\` ON \`infra_episodio_derivado\` (\`regla_version\`);
CREATE INDEX IF NOT EXISTS \`infra_episodio_derivado_estado_idx\` ON \`infra_episodio_derivado\` (\`estado\`);
CREATE TABLE IF NOT EXISTS \`infra_episodio_miembro\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`episodio_derivado_id\` text NOT NULL,
  \`cue_anexo\` text NOT NULL,
  \`movimiento_id\` text,
  \`primera_afectacion_en\` text NOT NULL,
  \`recuperado_en\` text,
  FOREIGN KEY (\`episodio_derivado_id\`) REFERENCES \`infra_episodio_derivado\`(\`id\`) ON DELETE CASCADE,
  FOREIGN KEY (\`movimiento_id\`) REFERENCES \`infra_movimiento\`(\`id\`)
);
CREATE INDEX IF NOT EXISTS \`infra_episodio_miembro_episodio_id_idx\` ON \`infra_episodio_miembro\` (\`episodio_derivado_id\`);
CREATE INDEX IF NOT EXISTS \`infra_episodio_miembro_cue_anexo_idx\` ON \`infra_episodio_miembro\` (\`cue_anexo\`);
-- Seasonal: tendencia ENOS a 30-90 días (Open-Meteo Seasonal), ver
-- lib/db/schema.ts (hazardSeasonalTrend) y
-- lib/infraestructura/riesgo/providers/seasonal.ts.
CREATE TABLE IF NOT EXISTS \`hazard_seasonal_trend\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`departamento\` text NOT NULL,
  \`provider\` text NOT NULL,
  \`model\` text NOT NULL,
  \`variable\` text NOT NULL,
  \`emision_en\` text NOT NULL,
  \`valido_desde\` text NOT NULL,
  \`valido_hasta\` text NOT NULL,
  \`horizonte_desde_dias\` integer NOT NULL,
  \`horizonte_hasta_dias\` integer NOT NULL,
  \`miembros_total\` integer NOT NULL,
  \`miembros_validos\` integer NOT NULL,
  \`media_mm\` real,
  \`mediana_mm\` real,
  \`dispersion_mm\` real,
  \`probabilidad_sobre_normal\` real,
  \`version\` text NOT NULL,
  \`ingerido_en\` text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`hazard_seasonal_trend_uidx\` ON \`hazard_seasonal_trend\` (\`departamento\`, \`variable\`, \`emision_en\`, \`horizonte_desde_dias\`, \`horizonte_hasta_dias\`);
CREATE INDEX IF NOT EXISTS \`hazard_seasonal_trend_departamento_idx\` ON \`hazard_seasonal_trend\` (\`departamento\`);
`

let seedPromise: Promise<void> | null = null

export function ensureSeeded() {
  if (!seedPromise) {
    seedPromise = seedHub().catch((err) => {
      seedPromise = null
      throw err
    })
  }
  return seedPromise
}

function withSeedFile(r: Recurso): Recurso {
  const spec = SEED_PUBLIC_FILES.find((s) => s.id === r.id)
  if (!spec) return r
  const copied = copySeedPublicFile(spec)
  return {
    ...r,
    ruta: undefined,
    storageKey: copied.storageKey,
    mime: spec.mime,
    nombreOriginal: spec.nombreOriginal,
    size: copied.size,
  }
}

async function convertExistingSeedFiles() {
  const db = getDb()
  const rows = await db
    .select({
      id: recursos.id,
      ruta: recursos.ruta,
      storageKey: recursos.storageKey,
    })
    .from(recursos)
  for (const row of rows) {
    if (!shouldReplaceWithSeedFile(row)) continue
    const spec = SEED_PUBLIC_FILES.find((s) => s.id === row.id)
    if (!spec) continue
    const copied = copySeedPublicFile(spec)
    await db
      .update(recursos)
      .set({
        ruta: null,
        storageKey: copied.storageKey,
        mime: spec.mime,
        nombreOriginal: spec.nombreOriginal,
        size: copied.size,
      })
      .where(eq(recursos.id, row.id))
  }
}

// `infra_movimiento.idempotency_key` no existía en el batch de esquema
// (batch 1): parteActualizacionInputSchema exige `idempotencyKey` pero la
// tabla no tenía dónde guardarla. Mismo motivo que cualquier columna
// agregada con ALTER a una base poblada: ALTER TABLE ADD COLUMN no es
// idempotente y SQLite no permite agregar una columna NOT NULL a una tabla
// con filas, así que queda nullable.
// El índice único NO vive en HUB_DDL (aunque la CREATE TABLE de ahí ya
// declara la columna): HUB_DDL corre antes que este `ensure*`, así que en
// una base batch 1 (todavía sin la columna) ese CREATE UNIQUE INDEX
// fallaría con "no such column: idempotency_key" y abortaría el resto de
// HUB_DDL, igual que pasaba con infra_verificacion_periodo_id_idx. Por eso
// el índice se crea acá abajo, después del ALTER, para los dos casos (tabla
// nueva ya con la columna, o tabla vieja recién alterada).
export async function ensureMovimientoIdempotencyKeyColumn(): Promise<void> {
  const db = getDb()
  const info = await db.$client.execute("PRAGMA table_info('infra_movimiento')")
  const tieneColumna = info.rows.some((r) => String(r.name) === 'idempotency_key')
  if (!tieneColumna) {
    await db.$client.execute('ALTER TABLE infra_movimiento ADD COLUMN idempotency_key text')
  }
  await db.$client.execute(
    'CREATE UNIQUE INDEX IF NOT EXISTS `infra_movimiento_idempotency_key_uidx` ON `infra_movimiento` (`idempotency_key`)',
  )
}

// El batch E1 introdujo `infra_movimiento.episodio_id` (enlazaba el
// movimiento con el episodio que lo originó); el producto rechazó el
// concepto de episodio administrado a mano (ver ensureVerificacionPeriodoId
// más abajo) y la columna se retira. Nunca se pobló (sin asignación
// retroactiva, ver el comentario original que tenía esta columna en
// schema.ts), así que no hay dato real que preservar. Sin FK ni índice
// declarados sobre ella (a diferencia de infra_verificacion.episodio_id), por
// eso el DROP COLUMN directo alcanza: SQLite lo soporta desde 3.35 siempre
// que la columna no sea parte de una FK, un índice o una PK. IF EXISTS lo
// hace idempotente para una base que ya se migró.
export async function ensureMovimientoEpisodioIdColumnDropped(): Promise<void> {
  const db = getDb()
  const info = await db.$client.execute("PRAGMA table_info('infra_movimiento')")
  const tieneColumna = info.rows.some((r) => String(r.name) === 'episodio_id')
  if (tieneColumna) {
    await db.$client.execute('ALTER TABLE infra_movimiento DROP COLUMN episodio_id')
  }
}

// El producto rechazó el episodio administrado a mano introducido en el
// batch E1 (nadie iba a abrirlos/cerrarlos manualmente): el monitoreo es
// continuo. `infra_verificacion.episodio_id` (NOT NULL, con FK e índice) se
// reemplaza por `periodo_id` (NOT NULL, FK a infra_periodo): la verificación
// se ancla directo al período provincial vigente en vez de a un episodio
// intermedio.
//
// A diferencia de las columnas nullable de arriba, acá no alcanza un ALTER
// simple: `episodio_id` tiene FK e índice propios, y SQLite no permite
// DROP COLUMN sobre una columna así ni agregar una columna NOT NULL a una
// tabla con filas. Se reconstruye la tabla completa (patrón estándar de
// SQLite para cambios de esquema que ALTER TABLE no cubre): tabla nueva,
// copia con backfill, DROP de la vieja, RENAME. El backfill toma el
// `periodo_id` del episodio que tenía cada verificación
// (infra_verificacion.episodio_id -> infra_episodio.periodo_id); si esa
// referencia estuviera rota (dato de prueba huérfano), cae al período
// vigente actual, que sembrarPeriodoEnos garantiza que exista siempre en
// una base que ya tenía esta tabla poblada. Se ejecuta ANTES de dropear
// infra_episodio (ver seedHub) porque necesita leerla para el backfill.
//
// `infra_verificacion_periodo_id_idx` NO vive en HUB_DDL: HUB_DDL corre
// antes que este `ensure*` (ver seedHub), así que en una base E1 (todavía
// con episodio_id, sin periodo_id) ese CREATE INDEX fallaría con "no such
// column: periodo_id" y, al ser parte del mismo executeMultiple, abortaría
// TODO el resto de HUB_DDL (nada de lo que sigue en el script se crearía).
// El índice se crea acá, al final de la función, para los dos caminos: recién
// migrada arriba, o ya migrada / tabla nueva creada directo por HUB_DDL.
export async function ensureVerificacionPeriodoIdColumn(): Promise<void> {
  const db = getDb()
  const info = await db.$client.execute("PRAGMA table_info('infra_verificacion')")
  const tieneEpisodioId = info.rows.some((r) => String(r.name) === 'episodio_id')

  if (tieneEpisodioId) {
    await db.$client.executeMultiple(`
PRAGMA foreign_keys = OFF;
CREATE TABLE \`infra_verificacion_new\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`periodo_id\` text NOT NULL,
  \`cue_anexo\` text NOT NULL,
  \`estado\` text NOT NULL,
  \`solicitada_en\` text NOT NULL,
  \`solicitada_por_user_id\` text NOT NULL,
  \`vencimiento_en\` text,
  \`resultado\` text,
  \`discrepancia\` integer DEFAULT 0 NOT NULL,
  \`respondida_en\` text,
  \`respondida_canal\` text,
  \`respondida_por_user_id\` text,
  \`movimiento_id\` text,
  \`cancelada_en\` text,
  \`cancelada_por_user_id\` text,
  \`motivo_cancelacion\` text,
  \`token_hash\` text NOT NULL,
  \`token_expira_en\` text NOT NULL,
  \`token_revocado_en\` text,
  \`token_consumido_en\` text,
  \`creada_en\` text NOT NULL,
  \`actualizada_en\` text NOT NULL,
  FOREIGN KEY (\`periodo_id\`) REFERENCES \`infra_periodo\`(\`id\`),
  FOREIGN KEY (\`movimiento_id\`) REFERENCES \`infra_movimiento\`(\`id\`)
);
INSERT INTO \`infra_verificacion_new\` (
  \`id\`, \`periodo_id\`, \`cue_anexo\`, \`estado\`, \`solicitada_en\`,
  \`solicitada_por_user_id\`, \`vencimiento_en\`, \`resultado\`, \`discrepancia\`,
  \`respondida_en\`, \`respondida_canal\`, \`respondida_por_user_id\`,
  \`movimiento_id\`, \`cancelada_en\`, \`cancelada_por_user_id\`,
  \`motivo_cancelacion\`, \`token_hash\`, \`token_expira_en\`,
  \`token_revocado_en\`, \`token_consumido_en\`, \`creada_en\`, \`actualizada_en\`
)
SELECT
  v.\`id\`,
  COALESCE(e.\`periodo_id\`, (SELECT id FROM \`infra_periodo\` WHERE estado = 'vigente' LIMIT 1)),
  v.\`cue_anexo\`, v.\`estado\`, v.\`solicitada_en\`, v.\`solicitada_por_user_id\`,
  v.\`vencimiento_en\`, v.\`resultado\`, v.\`discrepancia\`, v.\`respondida_en\`,
  v.\`respondida_canal\`, v.\`respondida_por_user_id\`, v.\`movimiento_id\`,
  v.\`cancelada_en\`, v.\`cancelada_por_user_id\`, v.\`motivo_cancelacion\`,
  v.\`token_hash\`, v.\`token_expira_en\`, v.\`token_revocado_en\`,
  v.\`token_consumido_en\`, v.\`creada_en\`, v.\`actualizada_en\`
FROM \`infra_verificacion\` v
LEFT JOIN \`infra_episodio\` e ON e.\`id\` = v.\`episodio_id\`;
DROP TABLE \`infra_verificacion\`;
ALTER TABLE \`infra_verificacion_new\` RENAME TO \`infra_verificacion\`;
CREATE INDEX IF NOT EXISTS \`infra_verificacion_cue_anexo_idx\` ON \`infra_verificacion\` (\`cue_anexo\`);
CREATE INDEX IF NOT EXISTS \`infra_verificacion_estado_idx\` ON \`infra_verificacion\` (\`estado\`);
CREATE UNIQUE INDEX IF NOT EXISTS \`infra_verificacion_token_hash_uidx\` ON \`infra_verificacion\` (\`token_hash\`);
PRAGMA foreign_keys = ON;
`)
  }

  await db.$client.execute(
    'CREATE INDEX IF NOT EXISTS `infra_verificacion_periodo_id_idx` ON `infra_verificacion` (`periodo_id`)',
  )
}

// infra_acceso_nominal_log.problematica_id nace apuntando al modelo
// deprecado, retirado en la Fase 4; F3.3 la repuntó a infra_afectacion.id. Es texto plano
// SIN foreign key, así que el rename es barato — no hay índices ni
// constraints que reconstruir.
export async function ensureAccesoNominalLogAfectacionIdColumn(): Promise<void> {
  const db = getDb()
  const info = await db.$client.execute("PRAGMA table_info('infra_acceso_nominal_log')")
  const columnas = new Set(info.rows.map((r) => String(r.name)))
  if (columnas.has('afectacion_id')) return
  if (!columnas.has('problematica_id')) return // tabla creada ya con el nombre nuevo (DDL fresco)
  await db.$client.execute('ALTER TABLE infra_acceso_nominal_log RENAME COLUMN problematica_id TO afectacion_id')
}

// Id fijo y estable del único período que existe en esta etapa (protocolo
// ENOS 2026/2027, ver CONTRACT.md del batch de esquema: "la situación
// hidrometeorológica es UN período provincial, no un episodio por
// establecimiento"). No hay ABM de períodos todavía, así que sembrarlo con un
// id conocido evita tener que buscarlo por nombre.
export const PERIODO_ENOS_2026_2027_ID = 'periodo-enos-2026-2027'

// Siembra idempotente (onConflictDoNothing por id) del único período que
// existe en esta etapa (protocolo ENOS 2026/2027). El backfill que enlazaba
// problemáticas del modelo deprecado con partes se retiró en la Fase 4
// (modelo eliminado, datos de prueba sin backfill); el período se conserva
// porque pertenece al modelo de parte vivo: parte-consulta, el mapa y los
// tests lo esperan sembrado por ensureSeeded().
export async function sembrarPeriodoEnos(): Promise<void> {
  const db = getDb()
  await db
    .insert(infraPeriodo)
    .values({
      id: PERIODO_ENOS_2026_2027_ID,
      nombre: 'Protocolo ENOS 2026/2027',
      inicioEn: '2026-01-01T00:00:00.000Z',
      finEn: null,
      estado: 'vigente',
      creadaEn: new Date().toISOString(),
    })
    .onConflictDoNothing()
}

async function seedHub() {
  const db = getDb()
  // WAL en vez del rollback journal por default: app/api/problematicas/parte/route.ts
  // abre transacciones de escritura con BEGIN IMMEDIATE en su propia conexión
  // nativa (cada `client.transaction()` de @libsql/client abre una conexión
  // nueva) mientras OTRAS conexiones del mismo proceso siguen leyendo (ge.sqlite
  // adjuntada, `obtenerAfectacionesYServicio`, etc.) — en rollback journal mode
  // un escritor con lock reservado/pendiente puede dejar sin lectura a esas
  // otras conexiones el tiempo suficiente para que la propia liberación del
  // lock quede bloqueada esperando un lector, un patrón que en la práctica
  // dejaba el lock colgado indefinidamente entre tests con dos escritores
  // concurrentes reales (Promise.all). WAL permite lectores concurrentes con
  // un único escritor sin ese bloqueo cruzado. `journal_mode` es una
  // propiedad del ARCHIVO (persiste en el header), así que basta con
  // pedirlo acá, una vez por proceso.
  await db.$client.execute('PRAGMA journal_mode=WAL')
  await db.$client.executeMultiple(HUB_DDL)
  // F4.6: las tres tablas del modelo deprecado ya no se crean en HUB_DDL; se
  // dropean acá, donde antes vivían sus helpers ensure/backfill, para que una
  // base existente se limpie sola al arrancar. Los datos eran de prueba: sin
  // backfill, dropeo directo. IF EXISTS lo hace idempotente y el orden
  // hijos→padre evita violar las FK que apuntaban a la tabla madre.
  await db.$client.execute('DROP TABLE IF EXISTS `infra_problematica_alumno`')
  await db.$client.execute('DROP TABLE IF EXISTS `infra_problematica_seccion`')
  await db.$client.execute('DROP TABLE IF EXISTS `infra_problematica`')
  await ensureMovimientoIdempotencyKeyColumn()
  await ensureAccesoNominalLogAfectacionIdColumn()
  // Debe correr ANTES del DROP de infra_episodio: el backfill de periodo_id
  // lee esa tabla para las verificaciones existentes.
  await ensureVerificacionPeriodoIdColumn()
  await ensureMovimientoEpisodioIdColumnDropped()
  // El episodio administrado a mano del batch E1 se descartó (ver
  // ensureVerificacionPeriodoIdColumn): el monitoreo es continuo, no
  // episódico. IF EXISTS lo hace idempotente para bases que ya no la tengan
  // (HUB_DDL ya no la crea).
  await db.$client.execute('DROP TABLE IF EXISTS `infra_episodio`')

  // Reintento ante SQLITE_BUSY (lib/db/reintento.ts): TODO el bloque —el
  // conteo Y la decisión de sembrar vs. convertir— vive DENTRO del intento,
  // nunca sólo la transacción de siembra. Si dos procesos corren seedHub()
  // casi al mismo tiempo (p. ej. el proceso web y un job de scripts/, cada
  // uno con su propia conexión) y éste pierde la carrera por el lock,
  // reintentar sólo la transacción con el `row.n === 0` viejo insertaría la
  // siembra dos veces (violando los UNIQUE de niveles/tipos/categorias/tags)
  // si el otro proceso ya la completó entre medio. Releer `count()` en cada
  // intento evita ese duplicado: un reintento que encuentra la base ya
  // sembrada simplemente pasa a `convertExistingSeedFiles()`, como si nunca
  // hubiera hecho falta sembrar.
  await conReintentoPorBloqueo(async () => {
    const [row] = await db.select({ n: count() }).from(niveles)
    if ((row?.n ?? 0) === 0) {
      const seeded = seedRecursos.map(withSeedFile)
      const tagJoins = seeded.flatMap((r) =>
        r.tagIds.map((tagId) => ({ recursoId: r.id, tagId })),
      )

      await db.transaction(async (tx) => {
        await tx.insert(niveles).values(seedNiveles)
        await tx.insert(tipos).values(seedTipos)
        await tx.insert(categorias).values(seedCategorias)
        await tx.insert(tags).values(seedTags)
        await tx.insert(recursos).values(
          seeded.map(
            ({ tagIds: _tagIds, audienciaNivelIds: _n, audienciaUserIds: _u, ...row }) =>
              row,
          ),
        )
        if (tagJoins.length > 0) {
          await tx.insert(recursoTags).values(tagJoins)
        }
      })
    } else {
      await convertExistingSeedFiles()
    }
  })

  // Fuera del if: corre siempre, también sobre una base ya poblada, y nunca
  // toca la audiencia configurada del recurso (ver recurso-seed.ts).
  await upsertRecursoInfraestructura()

  // Motivos de infraestructura: siembra idempotente (onConflictDoNothing,
  // ver sembrarMotivos). Corre siempre, no sólo en la siembra inicial, para
  // cubrir instalaciones ya pobladas que suman esta migración. (El backfill
  // de categoria sobre el modelo deprecado se retiró en la Fase 4.)
  await sembrarMotivos()
  // Debe correr después de sembrar: renombra los comodines heredados y recién
  // ahí crea el índice único sobre `nombre`, que es lo que hace que
  // resolverCategoria pueda deducir la categoría sin ambigüedad.
  await ensureMotivoNombreUnico()

  // Modelo de parte (ver docs/especificacion-funcional-trayectoria-evento-hidrometeorologico.md):
  // siembra el período provincial. Idempotente, corre siempre.
  await sembrarPeriodoEnos()

  // Siembra ge_localizacion desde el JSON versionado si esta vacia: ge.sqlite
  // vive en el volumen y una instalacion nueva arrancaria sin escuelas.
  await ensureLocalizacionesSeeded()

  await seedFirstAdmin()
}

async function seedFirstAdmin() {
  const db = getDb()
  const [row] = await db.select({ n: count() }).from(user)
  if ((row?.n ?? 0) > 0) return

  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password) {
    console.warn(
      'Skipping first admin seed: ADMIN_EMAIL and ADMIN_PASSWORD are required',
    )
    return
  }

  const { auth } = await import('@/lib/auth')
  const ctx = await auth.$context
  const created = await ctx.internalAdapter.createUser(
    {
      email,
      name: 'Admin',
      role: 'admin',
      emailVerified: true,
    },
    { method: 'admin' },
  )
  await ctx.internalAdapter.createAccount({
    userId: created.id,
    accountId: created.id,
    providerId: 'credential',
    issuer: 'local:credential',
    password: await ctx.password.hash(password),
  })
}
