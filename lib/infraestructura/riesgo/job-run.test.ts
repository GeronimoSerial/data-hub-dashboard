import { beforeAll, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import type { Pool } from 'pg'
import type { adquirirLease as AdquirirLease, publicarResultado as PublicarResultado, renovarLease as RenovarLease } from './job-run'

// Cómo correr el test de concurrencia REAL contra Postgres (el único de este
// archivo que no corre sobre PGlite en memoria):
//
//   1. Levantar un Postgres local con podman:
//        podman run --rm -d --name enos-pg \
//          -p 55432:5432 \
//          -e POSTGRES_USER=enos_test \
//          -e POSTGRES_PASSWORD=enos_test_local_only \
//          -e POSTGRES_DB=enos_db1_f3 \
//          postgres:16
//   2. Exportar la URL antes de correr vitest:
//        export DATABASE_URL_TEST='postgresql://enos_test:enos_test_local_only@localhost:55432/enos_db1_f3'
//        pnpm vitest run lib/infraestructura/riesgo/job-run.test.ts
//
// Sin DATABASE_URL_TEST ese describe se saltea con motivo explícito y la
// suite normal sigue corriendo 100% sobre PGlite en memoria, sin Docker.

usarDbTemporal('job-run-')

beforeAll(async () => {
  ;({ adquirirLease, renovarLease, publicarResultado } = await import('./job-run'))
})

let adquirirLease: typeof AdquirirLease
let renovarLease: typeof RenovarLease
let publicarResultado: typeof PublicarResultado

// Aislar la DB en un directorio temporal por archivo de test: getDb() memoiza
// la conexión a nivel de módulo (ver lib/db/index.ts), así que DATA_DIR debe
// setearse ANTES de cualquier import dinámico, igual que en lib/db/seed.test.ts.
describe('adquirirLease', () => {
  it('crea la fila la primera vez y devuelve adquirido:true', async () => {
    const r = await adquirirLease({
      tipo: 'diagnostico',
      claveIdempotente: 'clave-1',
      version: 'v1',
      duracionLeaseMs: 60_000,
    })
    expect(r.adquirido).toBe(true)
  })

  it('una segunda invocación con la misma clave mientras el lease sigue vigente no crea otra fila', async () => {
    const ahora = new Date('2026-01-01T00:00:00.000Z')
    const primera = await adquirirLease({
      tipo: 'diagnostico',
      claveIdempotente: 'clave-2',
      version: 'v1',
      duracionLeaseMs: 60_000,
      ahora,
    })
    expect(primera.adquirido).toBe(true)

    const segunda = await adquirirLease({
      tipo: 'diagnostico',
      claveIdempotente: 'clave-2',
      version: 'v1',
      duracionLeaseMs: 60_000,
      ahora: new Date(ahora.getTime() + 1_000),
    })
    expect(segunda).toEqual({ adquirido: false, motivo: 'en_progreso_vigente' })
    if (primera.adquirido) {
      const otra = await adquirirLease({
        tipo: 'diagnostico',
        claveIdempotente: 'clave-2',
        version: 'v1',
        duracionLeaseMs: 60_000,
        ahora: new Date(ahora.getTime() + 2_000),
      })
      // mismo jobRunId reutilizado, nunca una segunda fila
      expect(otra).toEqual({ adquirido: false, motivo: 'en_progreso_vigente' })
    }
  })

  it('publicarResultado completado impide una nueva adquisición: dos invocaciones no publican dos resultados', async () => {
    const ahora = new Date('2026-01-02T00:00:00.000Z')
    const primera = await adquirirLease({
      tipo: 'diagnostico',
      claveIdempotente: 'clave-3',
      version: 'v1',
      duracionLeaseMs: 60_000,
      ahora,
    })
    expect(primera.adquirido).toBe(true)
    if (!primera.adquirido) throw new Error('unreachable')

    await publicarResultado({
      jobRunId: primera.jobRunId,
      leaseOwner: primera.leaseOwner,
      estado: 'completado',
      contadores: { procesados: 5 },
      ahora: new Date(ahora.getTime() + 1_000),
    })

    const luego = await adquirirLease({
      tipo: 'diagnostico',
      claveIdempotente: 'clave-3',
      version: 'v1',
      duracionLeaseMs: 60_000,
      ahora: new Date(ahora.getTime() + 2_000),
    })
    expect(luego).toEqual({ adquirido: false, motivo: 'ya_completado' })
  })

  it('lease vencido (proceso muerto) permite recuperación controlada con intento incrementado', async () => {
    const ahora = new Date('2026-01-03T00:00:00.000Z')
    const primera = await adquirirLease({
      tipo: 'diagnostico',
      claveIdempotente: 'clave-4',
      version: 'v1',
      duracionLeaseMs: 1_000,
      ahora,
    })
    expect(primera.adquirido).toBe(true)
    if (!primera.adquirido) throw new Error('unreachable')

    // el lease vencido hace 1s atrás: ahora es posterior a leaseExpiraEn
    const recuperacion = await adquirirLease({
      tipo: 'diagnostico',
      claveIdempotente: 'clave-4',
      version: 'v1',
      duracionLeaseMs: 60_000,
      ahora: new Date(ahora.getTime() + 5_000),
    })
    expect(recuperacion.adquirido).toBe(true)
    if (!recuperacion.adquirido) throw new Error('unreachable')
    expect(recuperacion.jobRunId).toBe(primera.jobRunId)
    expect(recuperacion.leaseOwner).not.toBe(primera.leaseOwner)
  })

  it('publicarResultado sobre un job ya completado no cambia contadores/errorSaneado previos', async () => {
    const ahora = new Date('2026-01-04T00:00:00.000Z')
    const primera = await adquirirLease({
      tipo: 'diagnostico',
      claveIdempotente: 'clave-5',
      version: 'v1',
      duracionLeaseMs: 60_000,
      ahora,
    })
    if (!primera.adquirido) throw new Error('unreachable')

    await publicarResultado({
      jobRunId: primera.jobRunId,
      leaseOwner: primera.leaseOwner,
      estado: 'completado',
      contadores: { procesados: 3, exitosos: 3 },
      ahora: new Date(ahora.getTime() + 1_000),
    })

    // segundo intento de publicar con datos distintos: debe ser no-op
    await publicarResultado({
      jobRunId: primera.jobRunId,
      leaseOwner: primera.leaseOwner,
      estado: 'fallido',
      contadores: { procesados: 99 },
      errorSaneado: 'esto no debería quedar guardado',
      ahora: new Date(ahora.getTime() + 2_000),
    })

    const db = (await import('@/lib/db')).getDb()
    const { infraJobRun } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    const [fila] = await db.select().from(infraJobRun).where(eq(infraJobRun.id, primera.jobRunId))
    expect(fila?.estado).toBe('completado')
    expect(fila?.contadores).toEqual({ procesados: 3, exitosos: 3 })
    expect(fila?.errorSaneado).toBeNull()
  })
})

describe('renovarLease', () => {
  it('extiende leaseExpiraEn mientras el job sigue en_progreso', async () => {
    const ahora = new Date('2026-01-05T00:00:00.000Z')
    const primera = await adquirirLease({
      tipo: 'diagnostico',
      claveIdempotente: 'clave-6',
      version: 'v1',
      duracionLeaseMs: 5_000,
      ahora,
    })
    if (!primera.adquirido) throw new Error('unreachable')

    const renovado = await renovarLease({
      jobRunId: primera.jobRunId,
      leaseOwner: primera.leaseOwner,
      duracionLeaseMs: 60_000,
      ahora: new Date(ahora.getTime() + 4_000),
    })
    expect(renovado).toBe(true)

    // sin la renovación, este 'ahora' (6s después del inicio) habría vencido
    // el lease original de 5s; con la renovación sigue vigente.
    const segunda = await adquirirLease({
      tipo: 'diagnostico',
      claveIdempotente: 'clave-6',
      version: 'v1',
      duracionLeaseMs: 60_000,
      ahora: new Date(ahora.getTime() + 6_000),
    })
    expect(segunda).toEqual({ adquirido: false, motivo: 'en_progreso_vigente' })
  })

  it('devuelve false sin lanzar si el jobRunId no existe', async () => {
    const renovado = await renovarLease({
      jobRunId: 'no-existe',
      leaseOwner: 'cualquier-owner',
      duracionLeaseMs: 1_000,
    })
    expect(renovado).toBe(false)
  })
})

describe('fencing de lease (leaseOwner)', () => {
  it('proceso viejo no puede publicar sobre el lease de otro que lo recuperó', async () => {
    const ahora = new Date('2026-01-10T00:00:00.000Z')
    const a = await adquirirLease({
      tipo: 'diagnostico',
      claveIdempotente: 'clave-fencing-publicar',
      version: 'v1',
      duracionLeaseMs: 1_000,
      ahora,
    })
    expect(a.adquirido).toBe(true)
    if (!a.adquirido) throw new Error('unreachable')

    // el lease de A vence y B recupera la MISMA fila con un leaseOwner distinto
    const b = await adquirirLease({
      tipo: 'diagnostico',
      claveIdempotente: 'clave-fencing-publicar',
      version: 'v1',
      duracionLeaseMs: 60_000,
      ahora: new Date(ahora.getTime() + 5_000),
    })
    expect(b.adquirido).toBe(true)
    if (!b.adquirido) throw new Error('unreachable')
    expect(b.jobRunId).toBe(a.jobRunId)
    expect(b.leaseOwner).not.toBe(a.leaseOwner)

    // A despierta tarde y publica con su leaseOwner viejo: debe ser rechazado
    const publicadoPorA = await publicarResultado({
      jobRunId: a.jobRunId,
      leaseOwner: a.leaseOwner,
      estado: 'completado',
      contadores: { procesados: 1 },
      ahora: new Date(ahora.getTime() + 6_000),
    })
    expect(publicadoPorA).toBe(false)

    const db = (await import('@/lib/db')).getDb()
    const { infraJobRun } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    const [fila] = await db.select().from(infraJobRun).where(eq(infraJobRun.id, a.jobRunId))
    expect(fila?.estado).toBe('en_progreso')
    expect(fila?.leaseOwner).toBe(b.leaseOwner)
    expect(fila?.contadores).toBeNull()
  })

  it('proceso viejo no puede renovar el lease de otro que lo recuperó', async () => {
    const ahora = new Date('2026-01-11T00:00:00.000Z')
    const a = await adquirirLease({
      tipo: 'diagnostico',
      claveIdempotente: 'clave-fencing-renovar',
      version: 'v1',
      duracionLeaseMs: 1_000,
      ahora,
    })
    expect(a.adquirido).toBe(true)
    if (!a.adquirido) throw new Error('unreachable')

    const b = await adquirirLease({
      tipo: 'diagnostico',
      claveIdempotente: 'clave-fencing-renovar',
      version: 'v1',
      duracionLeaseMs: 60_000,
      ahora: new Date(ahora.getTime() + 5_000),
    })
    expect(b.adquirido).toBe(true)
    if (!b.adquirido) throw new Error('unreachable')

    const db = (await import('@/lib/db')).getDb()
    const { infraJobRun } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    const [antes] = await db.select().from(infraJobRun).where(eq(infraJobRun.id, a.jobRunId))
    const expiraDeB = antes?.leaseExpiraEn

    // A despierta tarde y renueva con su leaseOwner viejo: debe ser rechazado
    const renovadoPorA = await renovarLease({
      jobRunId: a.jobRunId,
      leaseOwner: a.leaseOwner,
      duracionLeaseMs: 999_000,
      ahora: new Date(ahora.getTime() + 6_000),
    })
    expect(renovadoPorA).toBe(false)

    const [despues] = await db.select().from(infraJobRun).where(eq(infraJobRun.id, a.jobRunId))
    expect(despues?.leaseExpiraEn).toBe(expiraDeB)
    expect(despues?.leaseOwner).toBe(b.leaseOwner)
  })

  it('B publica exitosamente con su propio leaseOwner', async () => {
    const ahora = new Date('2026-01-12T00:00:00.000Z')
    const a = await adquirirLease({
      tipo: 'diagnostico',
      claveIdempotente: 'clave-fencing-b-publica',
      version: 'v1',
      duracionLeaseMs: 1_000,
      ahora,
    })
    expect(a.adquirido).toBe(true)
    if (!a.adquirido) throw new Error('unreachable')

    const b = await adquirirLease({
      tipo: 'diagnostico',
      claveIdempotente: 'clave-fencing-b-publica',
      version: 'v1',
      duracionLeaseMs: 60_000,
      ahora: new Date(ahora.getTime() + 5_000),
    })
    expect(b.adquirido).toBe(true)
    if (!b.adquirido) throw new Error('unreachable')

    const publicadoPorB = await publicarResultado({
      jobRunId: b.jobRunId,
      leaseOwner: b.leaseOwner,
      estado: 'completado',
      contadores: { procesados: 7 },
      ahora: new Date(ahora.getTime() + 6_000),
    })
    expect(publicadoPorB).toBe(true)

    const db = (await import('@/lib/db')).getDb()
    const { infraJobRun } = await import('@/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    const [fila] = await db.select().from(infraJobRun).where(eq(infraJobRun.id, b.jobRunId))
    expect(fila?.estado).toBe('completado')
    expect(fila?.contadores).toEqual({ procesados: 7 })
  })
})

// TEST 1 — concurrencia REAL contra Postgres con dos conexiones
// independientes. Reemplaza al viejo test que abría una segunda conexión
// @libsql/client contra un archivo hub.sqlite suelto: ese archivo NUNCA era
// la base que usa adquirirLease (getDb() va a PGlite en memoria bajo Vitest, o
// a Postgres con DATABASE_URL), así que su BEGIN IMMEDIATE no bloqueaba nada
// real y el test era un falso positivo. Acá las dos conexiones son dos
// pg.Pool distintos contra la MISMA base real: se migra una sola vez y luego
// se lanzan ambas adquisiciones en paralelo. La garantía del CAS por fila
// (INSERT ... ON CONFLICT DO NOTHING RETURNING) exige exactamente un ganador,
// sin importar cuál gane la carrera.
describe('adquirirLease concurrencia real entre dos conexiones Postgres', () => {
  it.skipIf(!process.env.DATABASE_URL_TEST)(
    'dos conexiones independientes compiten por la misma clave: exactamente una obtiene adquirido:true — se saltea si no está seteada DATABASE_URL_TEST (requiere un Postgres real)',
    async () => {
      const databaseUrlTest = process.env.DATABASE_URL_TEST
      if (!databaseUrlTest) throw new Error('unreachable: gateado por it.skipIf')

      const prevDatabaseUrl = process.env.DATABASE_URL
      process.env.DATABASE_URL = databaseUrlTest
      let poolA: Pool | undefined
      let poolB: Pool | undefined
      try {
        // Cada vi.resetModules() + import reconstruye lib/db, así que su
        // memoización de la conexión arranca de cero: dos getDb() distintos,
        // cada uno con su propio pg.Pool (drizzle-orm/node-postgres) contra
        // la MISMA base real.
        vi.resetModules()
        const {
          getDb: getDbA,
          getRawClient: getRawClientA,
          migrarDb: migrarDbA,
        } = await import('@/lib/db')
        const { adquirirLease: adquirirLeaseA } = await import('./job-run')
        poolA = getRawClientA() as Pool

        vi.resetModules()
        const { getRawClient: getRawClientB } = await import('@/lib/db')
        const { adquirirLease: adquirirLeaseB } = await import('./job-run')
        poolB = getRawClientB() as Pool

        expect(poolA).not.toBe(poolB)

        // El esquema se migra una sola vez (migrarDb es idempotente); la
        // segunda conexión comparte la misma base ya migrada.
        await migrarDbA()

        const claveIdempotente = `clave-carrera-postgres-${Date.now()}-${Math.random().toString(36).slice(2)}`
        const params = {
          tipo: 'diagnostico',
          claveIdempotente,
          version: 'v1',
          duracionLeaseMs: 60_000,
        }

        const [resultadoA, resultadoB] = await Promise.all([
          adquirirLeaseA(params),
          adquirirLeaseB(params),
        ])

        const ganadores = [resultadoA, resultadoB].filter((r) => r.adquirido)
        const perdedores = [resultadoA, resultadoB].filter((r) => !r.adquirido)

        expect(ganadores).toHaveLength(1)
        expect(perdedores).toEqual([
          { adquirido: false, motivo: 'en_progreso_vigente' },
        ])

        const ganador = ganadores[0]
        if (!ganador?.adquirido) throw new Error('unreachable')

        // Un solo job corriendo por lease: una única fila para la clave, y es
        // la del ganador, no una por conexión.
        const { infraJobRun } = await import('@/lib/db/schema')
        const { and, eq } = await import('drizzle-orm')
        const filas = await getDbA()
          .select()
          .from(infraJobRun)
          .where(
            and(
              eq(infraJobRun.tipo, 'diagnostico'),
              eq(infraJobRun.claveIdempotente, claveIdempotente),
            ),
          )

        expect(filas).toHaveLength(1)
        expect(filas[0]?.id).toBe(ganador.jobRunId)
        expect(filas[0]?.estado).toBe('en_progreso')
        expect(filas[0]?.leaseOwner).toBe(ganador.leaseOwner)
      } finally {
        if (poolA) await poolA.end()
        if (poolB) await poolB.end()
        if (prevDatabaseUrl === undefined) delete process.env.DATABASE_URL
        else process.env.DATABASE_URL = prevDatabaseUrl
        vi.resetModules()
      }
    },
  )
})

// TEST 2 — concurrencia real dentro de un solo proceso sobre PGlite (corre
// siempre, sin gate). A diferencia del test secuencial de más arriba, las dos
// adquisiciones se disparan de verdad en paralelo (Promise.all) sobre la
// MISMA instancia de Db: el CAS por fila tiene que dejar exactamente un
// ganador aunque dos promesas compitan sobre la misma conexión.
describe('adquirirLease concurrencia dentro de un proceso (PGlite)', () => {
  it('dos adquisiciones concurrentes de la misma clave: exactamente una obtiene adquirido:true', async () => {
    const claveIdempotente = `clave-carrera-pglite-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const params = {
      tipo: 'diagnostico',
      claveIdempotente,
      version: 'v1',
      duracionLeaseMs: 60_000,
    }

    const [resultadoA, resultadoB] = await Promise.all([
      adquirirLease(params),
      adquirirLease(params),
    ])

    const ganadores = [resultadoA, resultadoB].filter((r) => r.adquirido)
    const perdedores = [resultadoA, resultadoB].filter((r) => !r.adquirido)

    expect(ganadores).toHaveLength(1)
    expect(perdedores).toEqual([
      { adquirido: false, motivo: 'en_progreso_vigente' },
    ])
  })
})
