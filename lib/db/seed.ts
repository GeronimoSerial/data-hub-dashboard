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
  MOTIVOS_SEED,
  ensureMotivoNombreUnico,
  sembrarMotivos,
} from '@/lib/infraestructura/motivos'
import { CATEGORIAS } from '@/lib/infraestructura/categorias'

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
CREATE TABLE IF NOT EXISTS \`infra_problematica\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`cue_anexo\` text NOT NULL,
  \`motivo\` text NOT NULL,
  \`severidad\` text NOT NULL,
  \`descripcion\` text,
  \`corte_id\` integer NOT NULL,
  \`creada_en\` text NOT NULL,
  \`idempotency_key\` text NOT NULL,
  \`origen\` text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS \`infra_problematica_idempotency_key_unique\` ON \`infra_problematica\` (\`idempotency_key\`);
CREATE INDEX IF NOT EXISTS \`infra_problematica_cue_anexo_idx\` ON \`infra_problematica\` (\`cue_anexo\`);
CREATE TABLE IF NOT EXISTS \`infra_problematica_seccion\` (
  \`problematica_id\` text NOT NULL,
  \`ge_section_id\` integer NOT NULL,
  PRIMARY KEY(\`problematica_id\`, \`ge_section_id\`),
  FOREIGN KEY (\`problematica_id\`) REFERENCES \`infra_problematica\`(\`id\`) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS \`infra_problematica_alumno\` (
  \`problematica_id\` text NOT NULL,
  \`ge_person_id\` integer NOT NULL,
  PRIMARY KEY(\`problematica_id\`, \`ge_person_id\`),
  FOREIGN KEY (\`problematica_id\`) REFERENCES \`infra_problematica\`(\`id\`) ON DELETE CASCADE
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
  \`problematica_id\` text NOT NULL,
  \`cantidad\` integer NOT NULL,
  \`consultado_en\` text NOT NULL
);
CREATE TABLE IF NOT EXISTS \`infra_motivo\` (
  \`id\` text PRIMARY KEY NOT NULL,
  \`nombre\` text NOT NULL,
  \`categoria\` text NOT NULL,
  \`orden\` integer DEFAULT 0 NOT NULL
);
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

// `infra_problematica.categoria` no existía antes de la categorización de
// problemáticas. `ALTER TABLE ADD COLUMN` no es idempotente (falla si la
// columna ya existe), así que este helper consulta PRAGMA table_info primero
// y sólo agrega la columna si falta. Se agrega sin NOT NULL: SQLite no
// permite agregar una columna NOT NULL sin default a una tabla con filas.
// Exportado únicamente para el test de regresión de seed.test.ts.
export async function ensureCategoriaColumn(): Promise<void> {
  const db = getDb()
  const info = await db.$client.execute("PRAGMA table_info('infra_problematica')")
  const tieneColumna = info.rows.some((r) => String(r.name) === 'categoria')
  if (!tieneColumna) {
    await db.$client.execute('ALTER TABLE infra_problematica ADD COLUMN categoria text')
  }
}

// Completa `categoria` en filas preexistentes (creadas antes de que la
// columna existiera) a partir del mapeo nombre→categoría de la semilla de
// motivos. Corre siempre, no sólo tras el ALTER: es idempotente (sólo toca
// filas con categoria NULL) y cubre tanto la migración inicial como
// cualquier fila que quedara sin categoría por otro motivo. Cualquier motivo
// desconocido (no está en la semilla) cae a 'establecimiento', el caso
// conservador que nunca expone identidades de alumnos.
export async function backfillCategoriaProblematicas(): Promise<void> {
  const db = getDb()
  const nombresPorCategoria = new Map<string, string[]>()
  for (const motivo of MOTIVOS_SEED) {
    const lista = nombresPorCategoria.get(motivo.categoria) ?? []
    lista.push(motivo.nombre)
    nombresPorCategoria.set(motivo.categoria, lista)
  }

  for (const categoria of CATEGORIAS) {
    const nombres = nombresPorCategoria.get(categoria) ?? []
    if (nombres.length === 0) continue
    const placeholders = nombres.map(() => '?').join(',')
    await db.$client.execute({
      sql: `UPDATE infra_problematica SET categoria = ? WHERE categoria IS NULL AND motivo IN (${placeholders})`,
      args: [categoria, ...nombres],
    })
  }

  await db.$client.execute(
    "UPDATE infra_problematica SET categoria = 'establecimiento' WHERE categoria IS NULL",
  )
}

async function seedHub() {
  const db = getDb()
  await db.$client.executeMultiple(HUB_DDL)
  await ensureCategoriaColumn()

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

  // Motivos de infra_problematica: siembra idempotente (onConflictDoNothing,
  // ver sembrarMotivos) y backfill de categoria en filas preexistentes.
  // Corren siempre, no sólo en la siembra inicial, para cubrir instalaciones
  // ya pobladas que suman esta migración.
  await sembrarMotivos()
  // Debe correr después de sembrar: renombra los comodines heredados y recién
  // ahí crea el índice único sobre `nombre`, que es lo que hace que
  // resolverCategoria pueda deducir la categoría sin ambigüedad.
  await ensureMotivoNombreUnico()
  await backfillCategoriaProblematicas()

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
