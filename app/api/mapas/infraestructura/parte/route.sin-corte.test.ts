import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Ruta from './route'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, getRawClient } from '@/lib/db'
import { infraAfectacion, infraParte } from '@/lib/db/schema'
import { crearEjecutorSql, ensureGeSchema } from '@/lib/infraestructura/ge-db'
import { getSessionUser } from '@/lib/session'

vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
}))

const CUE = '1801605-62'
const CUE_SIN_PARTE = '1801605-63'

usarDbTemporal('mapa-parte-sin-corte-', { seed: false })

let GET: typeof Ruta.GET

beforeAll(async () => {
  const client = crearEjecutorSql(getRawClient())
  await ensureGeSchema(client)

  const { ensureSeeded, PERIODO_ENOS_2026_2027_ID } = await import('@/lib/db/seed')
  await ensureSeeded()
  const ahora = new Date().toISOString()
  const parteId = crypto.randomUUID()
  const db = getDb()
  await db.insert(infraParte).values({
    id: parteId,
    periodoId: PERIODO_ENOS_2026_2027_ID,
    cueAnexo: CUE,
    estadoEstablecimiento: 'habitual',
    estadoEstablecimientoRigeDesde: ahora,
    corteId: 1,
    creadaEn: ahora,
    actualizadaEn: ahora,
  })
  await db.insert(infraAfectacion).values({
    id: crypto.randomUUID(),
    parteId,
    motivo: 'Inundación',
    categoria: 'establecimiento',
    severidad: 'Alta',
    descripcion: null,
    rigeDesde: ahora,
    creadaEn: ahora,
    retiradaEn: null,
  })
  GET = (await import('./route')).GET
})

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
  vi.mocked(getSessionUser).mockResolvedValue({
    id: 'u-sin-corte',
    role: 'consulta',
    banned: false,
    nivelIds: [],
    accesoRecursos: 'todos',
    recursoIds: [],
  })
})

function req(): Request {
  return new Request(`http://localhost/api/mapas/infraestructura/parte?cue=${encodeURIComponent(CUE)}`)
}

function reqSinParte(): Request {
  return new Request(`http://localhost/api/mapas/infraestructura/parte?cue=${encodeURIComponent(CUE_SIN_PARTE)}`)
}

describe('GET /api/mapas/infraestructura/parte sin corte vigente', () => {
  it('devuelve el parte y sus afectaciones sin datos de padrón ni secciones', async () => {
    const res = await GET(req())
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body).toMatchObject({ ok: true, datosPadron: null, secciones: [] })
    expect(body.parte).not.toBeNull()
    expect(body.afectaciones).toHaveLength(1)
    expect(body.afectaciones[0]).toMatchObject({
      categoria: 'establecimiento',
      severidad: 'Alta',
      totales: { secciones: expect.any(Number), alumnos: expect.any(Number) },
    })
    expect(typeof body.afectaciones[0].rigeDesde).toBe('string')
    expect(Number.isFinite(Date.parse(body.afectaciones[0].rigeDesde))).toBe(true)
  })

  it('devuelve la forma vacía cuando tampoco existe un parte', async () => {
    const res = await GET(reqSinParte())
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({
      ok: true,
      parte: null,
      datosPadron: null,
    })
    expect(body.afectaciones === undefined || body.afectaciones.length === 0).toBe(true)
  })
})
