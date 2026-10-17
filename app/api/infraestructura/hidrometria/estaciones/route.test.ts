import { beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { hidroLectura } from '@/lib/db/schema'
import type { AccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { CATALOGO_ESTACIONES_PREFECTURA } from '@/lib/infraestructura/hidrometria/estaciones-prefectura'
import { USER } from '@/lib/infraestructura/riesgo/__fixtures__/motor-api'

// Factory puro (sin importOriginal) para no arrastrar @/lib/session -> @/lib/db
// antes de que el beforeAll fije DATA_DIR.
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({
  verificarAccesoLectura: vi.fn(),
}))

// seed: false: las migraciones se aplican explícitamente abajo.
usarDbTemporal('hidro-estaciones-route-', { seed: false })

const ESTACION = 'pna-ituzaingo'

function mockAcceso(acceso: AccesoLectura) {
  vi.mocked(verificarAccesoLectura).mockResolvedValue(acceso)
}

beforeAll(async () => {
  await migrarDb()
})

beforeEach(async () => {
  vi.mocked(verificarAccesoLectura).mockReset()
  await getDb().delete(hidroLectura)
})

async function llamar() {
  const { GET } = await import('./route')
  return GET()
}

function filaLectura(id: string, estacionId: string, lecturaM: number, medidaEn: string) {
  return {
    id,
    estacionId,
    lecturaM,
    variacionM: 0.02,
    periodoHoras: 1,
    medidaEn,
    estadoPublicado: 'CRECE',
    lecturaAnteriorM: lecturaM - 0.02,
    medidaAnteriorEn: '2026-10-13T11:00:00.000Z',
    alertaM: 5,
    evacuacionM: 6,
    inconsistente: false,
    motivosInconsistencia: [],
    hashOriginal: 'c'.repeat(64),
    catalogoVersion: 'estaciones-prefectura-v2',
    capturadaEn: '2026-10-13T12:05:00.000Z',
  }
}

describe('GET /api/infraestructura/hidrometria/estaciones', () => {
  it.each([
    ['rechaza sin sesión con 401', 401, 'No autenticado'],
    ['rechaza con sesión pero sin acceso al recurso con 403', 403, 'No tiene acceso a este recurso'],
  ] as const)('%s', async (_titulo, status, error) => {
    mockAcceso({ ok: false, status })
    const res = await llamar()
    expect(res.status).toBe(status)
    const body = await res.json()
    expect(body.estaciones).toBeUndefined()
    expect(body.error).toBe(error)
  })

  it('devuelve las 21 estaciones del catálogo con coordenadas no verificadas', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await llamar()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')

    const { estaciones } = await res.json()
    expect(estaciones).toHaveLength(21)
    expect(estaciones.every((e: { coordenadasVerificadas: boolean }) => e.coordenadasVerificadas === false)).toBe(true)
  })

  it('devuelve lectura nula y sin_dato para estaciones sin lecturas', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await llamar()
    const { estaciones } = await res.json()
    const estacion = estaciones.find((e: { estacionId: string }) => e.estacionId === ESTACION)

    const catalogo = CATALOGO_ESTACIONES_PREFECTURA.find((e) => e.estacionId === ESTACION)
    expect(estacion).toEqual({
      estacionId: ESTACION,
      nombre: catalogo?.nombrePna,
      rio: 'parana',
      rol: 'corrientes',
      lat: catalogo?.coordenadas?.lat,
      lon: catalogo?.coordenadas?.lon,
      coordenadasVerificadas: false,
      lectura: null,
      estado: 'sin_dato',
      lecturaVencida: false,
      estadoUltimaLectura: 'sin_dato',
      horasDesdeLectura: null,
      tendencia: 'sin_dato',
    })
  })

  it('clasifica como evacuacion una estación con lectura sobre evacuación', async () => {
    // Reloj fijo: la lectura de las 15:00 debe seguir vigente (menos de 12 h).
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-13T16:00:00.000Z'))
    onTestFinished(() => {
      vi.useRealTimers()
    })
    await getDb()
      .insert(hidroLectura)
      .values([filaLectura('l-evac', ESTACION, 6.4, '2026-10-13T15:00:00.000Z')])

    mockAcceso({ ok: true, user: USER })
    const res = await llamar()
    const { estaciones } = await res.json()
    const estacion = estaciones.find((e: { estacionId: string }) => e.estacionId === ESTACION)

    expect(estacion.estado).toBe('evacuacion')
    expect(estacion.tendencia).toBe('crece')
    expect(estacion.lectura).toMatchObject({
      lecturaM: 6.4,
      medidaEn: '2026-10-13T15:00:00.000Z',
      inconsistente: false,
    })
  })

  it('expone el estado de la última lectura vencida sin cambiar estado', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-14T17:00:00.000Z'))
    onTestFinished(() => {
      vi.useRealTimers()
    })
    await getDb()
      .insert(hidroLectura)
      .values([filaLectura('l-vieja', ESTACION, 6.4, '2026-10-13T15:00:00.000Z')])

    mockAcceso({ ok: true, user: USER })
    const res = await llamar()
    const { estaciones } = await res.json()
    const estacion = estaciones.find((e: { estacionId: string }) => e.estacionId === ESTACION)

    expect(estacion.estado).toBe('sin_dato')
    expect(estacion.lecturaVencida).toBe(true)
    expect(estacion.estadoUltimaLectura).toBe('evacuacion')
    expect(estacion.horasDesdeLectura).toBe(26)
  })
})
