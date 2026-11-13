import { cargarReferencias } from '@/lib/infraestructura/datasets/repositorio'
import { count, eq } from 'drizzle-orm'
import {
  categorias as seedCategorias,
  niveles as seedNiveles,
  nivelesJurisdiccionales as seedNivelesJur,
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
import { getDb, getRawClient, migrarDb } from './index'
import { conReintentoPorBloqueo } from './reintento'
import {
  categorias,
  infraPeriodo,
  niveles,
  nivelesJurisdiccionales,
  recursoTags,
  recursos,
  tags,
  tipos,
  user,
} from './schema'
import { RECURSO_INFRAESTRUCTURA_ID, upsertRecursoInfraestructura, upsertRecursoManaos } from '@/lib/infraestructura/recurso-seed'
import { regionActiva } from '@/lib/infraestructura/region/activa'
import { upsertRecursoNatalidad } from '@/lib/mapas/recurso-seed-natalidad'
import { upsertRecursoReorganizacion } from '@/lib/mapas/recurso-seed-reorganizacion'
import { ensureLocalizacionesSeeded } from '@/lib/infraestructura/localizaciones-seed'
import {
  ensureMotivoNombreUnico,
  sembrarMotivos,
} from '@/lib/infraestructura/motivos'
import { crearEjecutorSql } from '@/lib/infraestructura/ge-db'

let seedPromise: Promise<void> | null = null

export function ensureSeeded() {
  if (!seedPromise) {
    seedPromise = seedHub().catch((err) => {
      seedPromise = null
      throw err
    })
  }
  return seedPromise.then(() => cargarReferencias())
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
  // DB1/F2: el esquema ya no se crea a mano. Las migraciones versionadas de
  // drizzle-kit (./drizzle, generadas desde lib/db/schema.ts) reemplazan al
  // HUB_DDL SQLite y a los ensure*Column* que parcheaban bases viejas: el
  // schema pg-core ya declara todas las columnas, así que la migración inicial
  // las crea de una. Es el primer paso, antes de cualquier siembra.
  await migrarDb()

  const ejecutor = crearEjecutorSql(getRawClient())
  await ensureInfraAdjuntoColumns(ejecutor)
  // F4.6: las tres tablas del modelo deprecado (más infra_episodio, retirado
  // en el batch E1) ya no viven en el schema. En una base que las haya tenido
  // se limpian solas al arrancar; en una base Postgres creada por las
  // migraciones son no-ops. IF EXISTS lo hace idempotente y el orden
  // hijos→padre evita violar las FK que apuntaban a la tabla madre.
  await ejecutor.execute('DROP TABLE IF EXISTS infra_problematica_alumno')
  await ejecutor.execute('DROP TABLE IF EXISTS infra_problematica_seccion')
  await ejecutor.execute('DROP TABLE IF EXISTS infra_problematica')
  await ejecutor.execute('DROP TABLE IF EXISTS infra_episodio')

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
            ({ tagIds: _tagIds, audienciaNivelJurIds: _n, audienciaUserIds: _u, ...row }) =>
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
  await upsertRecursoManaos()
  // Una base reconstruida sólo para infraestructura conserva ese alcance.
  // El catálogo completo de instalaciones nuevas y bases existentes sigue
  // recibiendo natalidad; no se agregan otros módulos a un catálogo exclusivo.
  const catalogo = await db.select({ id: recursos.id }).from(recursos)
  // Natalidad y reorganización son módulos exclusivos de Corrientes.
  if (regionActiva().id === 'corrientes' && catalogo.some((recurso) => recurso.id !== RECURSO_INFRAESTRUCTURA_ID)) {
    await upsertRecursoNatalidad()
    await upsertRecursoReorganizacion()
  }

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

  // Catálogo de niveles jurisdiccionales de GE (ids fijos). Idempotente; la
  // migración 0013 ya lo siembra, esto cubre bases que no lo tengan.
  await getDb()
    .insert(nivelesJurisdiccionales)
    .values(seedNivelesJur)
    .onConflictDoNothing()

  // Siembra ge_localizacion desde el JSON versionado si esta vacia: ge.sqlite
  // vive en el volumen y una instalacion nueva arrancaria sin escuelas.
  await ensureLocalizacionesSeeded()

  await seedFirstAdmin()
}

/**
 * Keep the seed-time repair path aligned with migration 0019. Normally these
 * ALTERs are no-ops because migrarDb() has already applied that migration;
 * they also repair an attachment table created by an interrupted rollout.
 */
async function ensureInfraAdjuntoColumns(ejecutor: ReturnType<typeof crearEjecutorSql>) {
  const columns = [
    'id text',
    'movimiento_id text',
    'optimizada_obs_key text',
    'optimizada_size integer',
    'optimizada_content_type text',
    'optimizada_etag text',
    'miniatura_obs_key text',
    'miniatura_size integer',
    'miniatura_content_type text',
    'miniatura_etag text',
    "estado text NOT NULL DEFAULT 'pending'",
    'creada_por text',
  ]
  for (const column of columns) {
    await ejecutor.execute(`ALTER TABLE infra_adjunto ADD COLUMN IF NOT EXISTS ${column}`)
  }
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
