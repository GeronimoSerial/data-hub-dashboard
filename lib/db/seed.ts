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
CREATE UNIQUE INDEX IF NOT EXISTS \`infra_movimiento_idempotency_key_uidx\` ON \`infra_movimiento\` (\`idempotency_key\`);
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
// con filas, así que queda nullable. El índice único de HUB_DDL ya cubre las
// bases nuevas; acá sólo hace falta la columna para las que ya tenían la
// tabla creada sin ella.
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
