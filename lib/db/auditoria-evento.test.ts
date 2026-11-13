import { eq, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from './index'
import { resolveDriver } from './driver'
import { auditoriaEvento } from './schema'

usarDbTemporal('auditoria-evento-', { seed: false })

// Cada corrida usa IDs propios: la base *_test puede conservar filas entre corridas.
const CORRIDA = randomUUID().slice(0, 8)
const ID = (nombre: string) => `${CORRIDA}-${nombre}`

const MENSAJE_SOLO_INSERCION = 'auditoria_evento es de solo inserción'

// Corre contra PostgreSQL real sólo si DATABASE_URL está definida (driver.ts
// elige 'postgres' en ese caso). La base debe llamarse *_test para no tocar datos reales.
if (resolveDriver() === 'postgres') {
  const nombre = new URL(process.env.DATABASE_URL ?? '').pathname.replace(/^\//, '')
  if (!nombre.endsWith('_test')) {
    throw new Error(`auditoria-evento.test: la base debe terminar en _test (recibida: ${nombre})`)
  }
}

beforeAll(async () => {
  await migrarDb()
})

function eventoBase(id: string, metadatos: Record<string, unknown> = { ruta: 'x' }) {
  return {
    id: ID(id),
    requestId: `req-${ID(id)}`,
    ocurridoEn: new Date('2026-11-01T12:00:00.000Z'),
    actorTipo: 'usuario',
    actorId: 'user-1',
    actorRol: 'admin',
    viaAcceso: 'web',
    accion: 'lectura',
    metodo: 'GET',
    rutaPlantilla: '/recurso/[id]',
    objetoTipo: 'recurso',
    objetoId: 'r-1',
    cueAnexo: '060000100',
    resultado: 'ok',
    httpStatus: 200,
    duracionMs: 12,
    metadatos,
  }
}

// Drizzle envuelve el error de Postgres: el mensaje útil y el código quedan en `cause`.
function cadenaDeErrores(error: unknown): string {
  const partes: string[] = []
  let actual: unknown = error
  while (actual && typeof actual === 'object') {
    const e = actual as { message?: unknown; code?: unknown; cause?: unknown }
    if (typeof e.message === 'string') partes.push(e.message)
    if (typeof e.code === 'string') partes.push(`code:${e.code}`)
    actual = e.cause
  }
  return partes.join('\n')
}

async function capturarError(operacion: () => Promise<unknown>): Promise<string> {
  try {
    await operacion()
  } catch (error) {
    return cadenaDeErrores(error)
  }
  throw new Error('se esperaba un error y la operación terminó bien')
}

describe('auditoria_evento es append-only', () => {
  it('acepta insertar un evento', async () => {
    const db = getDb()
    await db.insert(auditoriaEvento).values(eventoBase('ins-1'))

    const filas = await db.select().from(auditoriaEvento)
    expect(filas.filter((f) => f.id === ID('ins-1'))).toMatchObject([
      { id: ID('ins-1'), actorId: 'user-1', metadatos: { ruta: 'x' } },
    ])
  })

  it('rechaza UPDATE con el mensaje de solo inserción', async () => {
    const db = getDb()
    await db.insert(auditoriaEvento).values(eventoBase('upd-1'))

    const mensaje = await capturarError(() =>
      db.update(auditoriaEvento).set({ resultado: 'alterado' }).where(eq(auditoriaEvento.id, ID('upd-1'))),
    )
    expect(mensaje).toContain(MENSAJE_SOLO_INSERCION)
    expect(mensaje).toContain('code:23001')
  })

  it('rechaza DELETE con el mensaje de solo inserción', async () => {
    const db = getDb()
    await db.insert(auditoriaEvento).values(eventoBase('del-1'))

    const mensaje = await capturarError(() =>
      db.delete(auditoriaEvento).where(eq(auditoriaEvento.id, ID('del-1'))),
    )
    expect(mensaje).toContain(MENSAJE_SOLO_INSERCION)
    expect(mensaje).toContain('code:23001')
  })

  it('deja la fila intacta tras un UPDATE y un DELETE rechazados', async () => {
    const db = getDb()
    await db.insert(auditoriaEvento).values(eventoBase('intacta-1'))

    await capturarError(() =>
      db.update(auditoriaEvento).set({ resultado: 'alterado' }).where(eq(auditoriaEvento.id, ID('intacta-1'))),
    )
    await capturarError(() =>
      db.delete(auditoriaEvento).where(eq(auditoriaEvento.id, ID('intacta-1'))),
    )

    const filas = await db.select().from(auditoriaEvento).where(eq(auditoriaEvento.id, ID('intacta-1')))
    expect(filas).toHaveLength(1)
    expect(filas[0]).toMatchObject({
      id: ID('intacta-1'),
      requestId: `req-${ID('intacta-1')}`,
      resultado: 'ok',
      httpStatus: 200,
      duracionMs: 12,
      metadatos: { ruta: 'x' },
    })
  })

  it('rechaza metadatos de más de 4096 bytes por el CHECK', async () => {
    const db = getDb()
    const mensaje = await capturarError(() =>
      db.insert(auditoriaEvento).values(eventoBase('grande-1', { relleno: 'x'.repeat(4100) })),
    )
    expect(mensaje).toContain('auditoria_evento_metadatos_limite')
  })

  it('crea los dos índices de consulta', async () => {
    const db = getDb()
    const indices = await db.execute(sql`
      SELECT indexname FROM pg_indexes WHERE tablename = 'auditoria_evento'
    `)
    const nombres = (indices as { rows: Array<{ indexname: string }> }).rows.map((r) => r.indexname)
    expect(nombres).toEqual(expect.arrayContaining([
      'auditoria_evento_actor_fecha_idx',
      'auditoria_evento_fecha_idx',
    ]))
  })
})
