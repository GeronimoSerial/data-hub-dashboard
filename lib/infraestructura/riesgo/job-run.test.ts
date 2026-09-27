import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { adquirirLease as AdquirirLease, publicarResultado as PublicarResultado, renovarLease as RenovarLease } from './job-run'

let dir: string
let prevDataDir: string | undefined
let adquirirLease: typeof AdquirirLease
let renovarLease: typeof RenovarLease
let publicarResultado: typeof PublicarResultado

// Aislar la DB en un directorio temporal por archivo de test: getDb() memoiza
// la conexión a nivel de módulo (ver lib/db/index.ts), así que DATA_DIR debe
// setearse ANTES de cualquier import dinámico, igual que en lib/db/seed.test.ts.
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'job-run-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()
  ;({ adquirirLease, renovarLease, publicarResultado } = await import('./job-run'))
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

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

// Reintento ante SQLITE_BUSY (lib/db/reintento.ts), con un lock de escritura
// real tomado por una SEGUNDA conexión al mismo hub.sqlite — no un mock: si
// el reintento de adquirirLease no cediera el hilo (setTimeout real) o no
// reintentara el statement completo, este test colgaría hasta el timeout de
// vitest en vez de resolver apenas la otra conexión libera el lock.
describe('adquirirLease reintenta ante un lock real de otra conexión', () => {
  it('adquirirLease se bloquea con SQLITE_BUSY mientras otra conexión sostiene BEGIN IMMEDIATE y adquiere apenas se libera', async () => {
    const { createClient } = await import('@libsql/client')
    const { getSqlitePath } = await import('@/lib/data-dir')

    // Segunda conexión NATIVA al mismo archivo hub.sqlite (no la memoizada
    // por getDb() de este proceso de test): simula el escritor concurrente
    // real que compite por el lock, igual que dos requests de
    // app/api/problematicas/parte/route.ts.
    const otraConexion = createClient({ url: `file:${getSqlitePath()}` })
    const otraTx = await otraConexion.transaction('write')

    try {
      // adquirirLease arranca mientras `otraTx` todavía tiene el lock de
      // escritura tomado: el INSERT/UPDATE de más abajo tiene que pegar
      // contra SQLITE_BUSY y quedar reintentando con backoff.
      const promesaLease = adquirirLease({
        tipo: 'diagnostico',
        claveIdempotente: 'clave-lock-real',
        version: 'v1',
        duracionLeaseMs: 60_000,
      })

      // Se le da tiempo a adquirirLease de pegar contra el lock ocupado y
      // entrar en su loop de reintento antes de soltarlo.
      await new Promise((resolve) => setTimeout(resolve, 80))

      await otraTx.commit()
      otraTx.close()

      const resultado = await promesaLease
      expect(resultado.adquirido).toBe(true)
    } finally {
      otraConexion.close()
    }
  })
})
