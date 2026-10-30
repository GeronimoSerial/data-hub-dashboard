import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSessionUser } from '@/lib/session'
import { loadRecursoAccessByRuta } from '@/lib/db/recurso-access'
import type { RecursoAccess, SessionUser } from '@/lib/acl'
import { GET } from './route'

vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
}))

vi.mock('@/lib/db/recurso-access', () => ({
  loadRecursoAccessByRuta: vi.fn(),
}))

const ORIGEN = '-27.47,-58.83'
const DESTINO = '-28.1,-57.1'

const usuario: SessionUser = {
  id: 'u1',
  role: 'consulta',
  banned: false,
  nivelJurIds: [],
  accesoRecursos: 'todos',
  recursoIds: [],
  hubPolicy: { enabledSections: ['maps'] },
}

const accesoPublico: RecursoAccess = { id: 'recurso-reorganizacion', estado: 'publicado', audienciaNivelJurIds: [], audienciaUserIds: ['u1'] }
const recursoPublico = { id: 'recurso-reorganizacion', access: accesoPublico }

const geometria = { type: 'LineString', coordinates: [[-58.83, -27.47], [-57.1, -28.1]] }

function pedido(qs: string, init?: RequestInit) {
  return new Request(`http://localhost/api/mapas/reorganizacion/ruta${qs}`, init)
}

function qs(origen = ORIGEN, destino = DESTINO) {
  return `?origen=${encodeURIComponent(origen)}&destino=${encodeURIComponent(destino)}`
}

function respuestaOsrm(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
  vi.mocked(loadRecursoAccessByRuta).mockReset()
  vi.mocked(loadRecursoAccessByRuta).mockResolvedValue(recursoPublico)
  vi.mocked(getSessionUser).mockResolvedValue(usuario)
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  delete process.env.REORGANIZACION_OSRM_URL
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GET /api/mapas/reorganizacion/ruta', () => {
  it('rechaza sin sesión y no consulta al proveedor', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const res = await GET(pedido(qs()))
    expect(res.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rechaza a un usuario sin audiencia sobre el recurso', async () => {
    vi.mocked(loadRecursoAccessByRuta).mockResolvedValue({
      id: 'recurso-reorganizacion',
      access: { id: 'recurso-reorganizacion', estado: 'publicado', audienciaNivelJurIds: [2], audienciaUserIds: [] } satisfies RecursoAccess,
    })
    vi.mocked(getSessionUser).mockResolvedValue({ ...usuario, nivelJurIds: [3] })
    const res = await GET(pedido(qs()))
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rechaza si el recurso no está dado de alta', async () => {
    vi.mocked(loadRecursoAccessByRuta).mockResolvedValue(null)
    const res = await GET(pedido(qs()))
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('valida parámetros antes de consultar al proveedor', async () => {
    const casos = [
      '',
      '?origen=-27.47,-58.83',
      `?origen=abc&destino=${DESTINO}`,
      `?origen=-34.6,-58.4&destino=${DESTINO}`,
      `?origen=${ORIGEN}&destino=-27.5,-54.0`,
    ]
    for (const q of casos) {
      const res = await GET(pedido(q))
      expect(res.status, q).toBe(400)
      expect(await res.json()).toEqual({ error: 'parametros_invalidos' })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('devuelve distancia, duración y geometría de OSRM', async () => {
    process.env.REORGANIZACION_OSRM_URL = 'https://osrm.test/'
    fetchMock.mockResolvedValue(
      respuestaOsrm({ code: 'Ok', routes: [{ distance: 45230, duration: 2710, geometry: geometria }] }),
    )
    const res = await GET(pedido(qs()))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await res.json()).toEqual({ distanciaKm: 45.2, duracionMin: 45, geometria })

    const [url] = fetchMock.mock.calls[0]
    expect(String(url)).toBe(
      'https://osrm.test/route/v1/driving/-58.83,-27.47;-57.1,-28.1?overview=full&geometries=geojson',
    )
  })

  it('usa el proveedor público si no hay URL configurada', async () => {
    fetchMock.mockResolvedValue(respuestaOsrm({ code: 'Ok', routes: [{ distance: 1000, duration: 60, geometry: geometria }] }))
    await GET(pedido(qs()))
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^https:\/\/router\.project-osrm\.org\/route\/v1\/driving\//)
  })

  it('OSRM sin ruta vial responde 404 y nunca una distancia en línea recta', async () => {
    fetchMock.mockResolvedValue(respuestaOsrm({ code: 'NoRoute', message: 'No route found' }))
    const res = await GET(pedido(qs()))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body).toEqual({ error: 'sin_ruta_vial' })
    expect(body.distanciaKm).toBeUndefined()
  })

  it('timeout del proveedor responde 504', async () => {
    fetchMock.mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
    const res = await GET(pedido(qs()))
    expect(res.status).toBe(504)
    expect(await res.json()).toEqual({ error: 'tiempo_agotado' })
  })

  it('error 500 del proveedor responde 502', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 500 }))
    const res = await GET(pedido(qs()))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'proveedor_no_disponible' })
  })

  it('red caída responde 502', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    const res = await GET(pedido(qs()))
    expect(res.status).toBe(502)
  })

  it('pasa la cancelación del cliente al proveedor y responde 499', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        }),
    )
    const controlador = new AbortController()
    const pendiente = GET(pedido(qs(), { signal: controlador.signal }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    controlador.abort()
    const res = await pendiente
    expect(res.status).toBe(499)
    const [, init] = fetchMock.mock.calls[0]
    expect((init as RequestInit).signal?.aborted).toBe(true)
  })
})
