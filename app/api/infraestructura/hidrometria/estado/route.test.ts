import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getDb, migrarDb } from '@/lib/db'
import { hidroLectura } from '@/lib/db/schema'
import type { AccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { obtenerEstacionesPrefectura } from '@/lib/infraestructura/hidrometria/estaciones-prefectura'
import { USER } from '@/lib/infraestructura/riesgo/__fixtures__/motor-api'

// Factory puro (sin importOriginal) para no arrastrar @/lib/session -> @/lib/db
// antes de que el beforeAll fije DATA_DIR.
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({
  verificarAccesoLectura: vi.fn(),
}))

// seed: false: las migraciones se aplican explícitamente abajo.
usarDbTemporal('hidro-estado-route-', { seed: false })

// ITUZAINGO pertenece al tramo aprobado 'parana-ituzaingo' (estación pna-ituzaingo).
const LOCALIDAD = 'ITUZAINGO'
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

async function llamar(query: string) {
  const { GET } = await import('./route')
  return GET(new Request(`http://localhost/api/infraestructura/hidrometria/estado${query}`))
}

describe('GET /api/infraestructura/hidrometria/estado', () => {
  it.each([
    ['rechaza sin sesión con 401', 401, 'No autenticado'],
    ['rechaza con sesión pero sin acceso al recurso con 403', 403, 'No tiene acceso a este recurso'],
  ] as const)('%s', async (_titulo, status, error) => {
    mockAcceso({ ok: false, status })
    const res = await llamar(`?localidad=${LOCALIDAD}`)
    expect(res.status).toBe(status)
    const body = await res.json()
    expect(body.tramo).toBeUndefined()
    expect(body.error).toBe(error)
  })

  it.each([
    ['sin localidad', ''],
    ['localidad vacía', '?localidad='],
    ['localidad de más de 120 caracteres', `?localidad=${'A'.repeat(121)}`],
  ])('responde 400 si falta la localidad válida: %s', async (_titulo, query) => {
    mockAcceso({ ok: true, user: USER })
    const res = await llamar(query)
    expect(res.status).toBe(400)
  })

  it('devuelve tramo nulo y lectura nula para una localidad sin tramo aprobado', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await llamar('?localidad=Ciudad%20inexistente')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ tramo: null, lectura: null })
  })

  it('devuelve el tramo con lectura nula cuando la estación no tiene lecturas', async () => {
    mockAcceso({ ok: true, user: USER })
    const res = await llamar(`?localidad=${LOCALIDAD}`)
    expect(res.status).toBe(200)

    const body = await res.json()
    const estacion = obtenerEstacionesPrefectura().find((e) => e.estacionId === ESTACION)
    expect(body).toEqual({
      tramo: {
        tramoId: 'parana-ituzaingo',
        rio: 'parana',
        estacionId: ESTACION,
        estacionNombre: estacion?.nombrePna,
      },
      lectura: null,
    })
  })

  it('devuelve la lectura más reciente de la estación con fechas en ISO', async () => {
    await getDb()
      .insert(hidroLectura)
      .values([
        {
          id: 'l-vieja',
          estacionId: ESTACION,
          lecturaM: 2.1,
          variacionM: 0.01,
          periodoHoras: 1,
          medidaEn: '2026-10-13T12:00:00.000Z',
          estadoPublicado: 'BAJA',
          lecturaAnteriorM: 2.2,
          medidaAnteriorEn: '2026-10-13T11:00:00.000Z',
          alertaM: 5,
          evacuacionM: 6,
          inconsistente: false,
          motivosInconsistencia: [],
          hashOriginal: 'a'.repeat(64),
          catalogoVersion: 'estaciones-prefectura-v2',
          capturadaEn: '2026-10-13T12:05:00.000Z',
        },
        {
          id: 'l-nueva',
          estacionId: ESTACION,
          lecturaM: 3.45,
          variacionM: 0.02,
          periodoHoras: 1,
          medidaEn: '2026-10-13T15:00:00.000Z',
          estadoPublicado: 'CRECE',
          lecturaAnteriorM: 3.43,
          medidaAnteriorEn: '2026-10-13T14:00:00.000Z',
          alertaM: 5,
          evacuacionM: 6,
          inconsistente: true,
          motivosInconsistencia: ['lectura_cero_con_crece'],
          hashOriginal: 'b'.repeat(64),
          catalogoVersion: 'estaciones-prefectura-v2',
          capturadaEn: '2026-10-13T15:05:00.000Z',
        },
      ])

    mockAcceso({ ok: true, user: USER })
    const res = await llamar(`?localidad=${LOCALIDAD}`)
    expect(res.status).toBe(200)

    const body = await res.json()
    expect(body.tramo).toMatchObject({ tramoId: 'parana-ituzaingo', estacionId: ESTACION })
    expect(body.lectura).toEqual({
      lecturaM: 3.45,
      variacionM: 0.02,
      periodoHoras: 1,
      medidaEn: '2026-10-13T15:00:00.000Z',
      estadoPublicado: 'CRECE',
      alertaM: 5,
      evacuacionM: 6,
      inconsistente: true,
      motivosInconsistencia: ['lectura_cero_con_crece'],
      capturadaEn: '2026-10-13T15:05:00.000Z',
    })
  })
})
