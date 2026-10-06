import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Ruta from './route'
import type { SessionUser } from '@/lib/acl'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { obtenerGeometriaAcceso } from '@/lib/infraestructura/territorio-mapa'
import type * as TerritorioMapaModulo from '@/lib/infraestructura/territorio-mapa'

// Se conserva la función PURA real (construirRespuestaGeometria) y sólo se
// mockea el loader de DB, para ejercitar el armado de la respuesta en el route.
vi.mock('@/lib/db/seed', () => ({ ensureSeeded: vi.fn() }))
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({
  verificarAccesoLectura: vi.fn(),
}))
vi.mock('@/lib/infraestructura/territorio-mapa', async (importOriginal) => {
  const actual = await importOriginal<typeof TerritorioMapaModulo>()
  return { ...actual, obtenerGeometriaAcceso: vi.fn() }
})

let GET: typeof Ruta.GET
beforeAll(async () => { GET = (await import('./route')).GET })

function usuario(): SessionUser {
  return {
    id: 'u-1',
    role: 'consulta',
    banned: false,
    nivelIds: [],
    accesoRecursos: 'todos' as const,
    recursoIds: [],
  }
}

function ctx(cueAnexo: string) {
  return { params: Promise.resolve({ cueAnexo }) }
}

function req(cueAnexo = 'CUE-1') {
  return new Request(`http://localhost/api/mapas/infraestructura/accesos/${cueAnexo}/geometria`)
}

describe('GET /api/mapas/infraestructura/accesos/[cueAnexo]/geometria', () => {
  beforeEach(() => {
    vi.mocked(verificarAccesoLectura).mockReset()
    vi.mocked(obtenerGeometriaAcceso).mockReset()
  })

  it('sin sesión responde 401 y no toca el loader', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: false, status: 401 })
    const res = await GET(req(), ctx('CUE-1'))
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('No autenticado')
    expect(obtenerGeometriaAcceso).not.toHaveBeenCalled()
  })

  it('sin audiencia permitida responde 403 y no toca el loader', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: false, status: 403 })
    const res = await GET(req(), ctx('CUE-1'))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('No tiene acceso a este recurso')
    expect(obtenerGeometriaAcceso).not.toHaveBeenCalled()
  })

  it('con cueAnexo vacío responde 400 sin llamar al loader', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: true, user: usuario() })
    const res = await GET(req(''), ctx(''))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('cueAnexo inválido')
    expect(obtenerGeometriaAcceso).not.toHaveBeenCalled()
  })

  it('sin geometría importada responde 200 con disponible false (nunca 404)', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: true, user: usuario() })
    vi.mocked(obtenerGeometriaAcceso).mockResolvedValue(null)
    const res = await GET(req('CUE-1'), ctx('CUE-1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-cache')
    expect(await res.json()).toEqual({
      cueAnexo: 'CUE-1',
      disponible: false,
      motivo: 'sin_geometria_importada',
    })
  })

  it('con ruta responde 200 y el resumen de cruces', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: true, user: usuario() })
    vi.mocked(obtenerGeometriaAcceso).mockResolvedValue({
      cueAnexo: 'CUE-1',
      versionJob: '3',
      ruta: {
        type: 'LineString',
        coordinates: [
          [-60.5, -31.7],
          [-60.6, -31.8],
        ],
      },
      cruces: [
        { lon: -60.51, lat: -31.71, clasificacion: 'puente' },
        { lon: -60.53, lat: -31.73, clasificacion: 'vado' },
      ],
      motivoSinGeometria: null,
      viaPrincipal: null,
      destinoNombre: null,
      distanciaDestinoM: null,
      fechaExtractoOsm: '2026-01-01',
      licencia: 'ODbL-1.0',
      importadoEn: '2026-01-01T00:00:00Z',
    })

    const res = await GET(req('CUE-1'), ctx('CUE-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.disponible).toBe(true)
    expect(body.resumen).toEqual({ puente: 1, vado: 1, sinEvidencia: 0 })
    expect(body.cueAnexo).toBe('CUE-1')
  })
})
