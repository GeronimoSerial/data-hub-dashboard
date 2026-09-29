import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { obtenerExposicionRuta } from '@/lib/infraestructura/exposicion-ruta'
import type * as ExposicionRutaModulo from '@/lib/infraestructura/exposicion-ruta'

vi.mock('@/lib/db/seed', () => ({ ensureSeeded: vi.fn() }))
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({ verificarAccesoLectura: vi.fn() }))
vi.mock('@/lib/infraestructura/exposicion-ruta', async (importOriginal) => {
  const actual = await importOriginal<typeof ExposicionRutaModulo>()
  return { ...actual, obtenerExposicionRuta: vi.fn() }
})

function usuario(): SessionUser {
  return { id: 'u-1', role: 'consulta', banned: false, nivelIds: [], accesoRecursos: 'todos', recursoIds: [] }
}
function ctx(cueAnexo: string) { return { params: Promise.resolve({ cueAnexo }) } }
function req(cueAnexo = 'CUE-1') {
  return new Request(`http://localhost/api/mapas/infraestructura/accesos/${cueAnexo}/exposicion-inundacion`)
}

describe('GET /api/mapas/infraestructura/accesos/[cueAnexo]/exposicion-inundacion', () => {
  beforeEach(() => {
    vi.mocked(verificarAccesoLectura).mockReset()
    vi.mocked(obtenerExposicionRuta).mockReset()
  })

  it('responde 401 antes de consultar', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: false, status: 401 })
    const { GET } = await import('./route')
    expect((await GET(req(), ctx('CUE-1'))).status).toBe(401)
    expect(obtenerExposicionRuta).not.toHaveBeenCalled()
  })

  it('responde 403 antes de consultar', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: false, status: 403 })
    const { GET } = await import('./route')
    expect((await GET(req(), ctx('CUE-1'))).status).toBe(403)
    expect(obtenerExposicionRuta).not.toHaveBeenCalled()
  })

  it('rechaza cueAnexo inválido', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: true, user: usuario() })
    const { GET } = await import('./route')
    const res = await GET(req(''), ctx(''))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('cueAnexo inválido')
    expect(obtenerExposicionRuta).not.toHaveBeenCalled()
  })

  it('responde 200 con exposición y encabezado privado', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: true, user: usuario() })
    vi.mocked(obtenerExposicionRuta).mockResolvedValue({
      cueAnexo: 'CUE-1', versionJob: '1', estado: 'con_profundidad', motivoSinDato: null,
      celdasTotal: 1, celdasConDato: 1, celdasConProfundidad: 1, profundidadMaxM: 0.2,
      cobertura: 1, periodoRetornoAnios: 100, resolucionArcsec: 30, escenario: 'historico',
      fuente: 'WRI Aqueduct v2', celdas: [{ lon: -60, lat: -31, profundidadM: 0.2 }],
      fechaCorrida: '2026-01-01', licencia: 'CC-BY-4.0', importadoEn: '2026-01-02',
    })
    const { GET } = await import('./route')
    const res = await GET(req(), ctx('CUE-1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-cache')
    expect((await res.json()).celdasAfectadas).toHaveLength(1)
  })

  it('responde 200 cuando no hay cobertura', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: true, user: usuario() })
    vi.mocked(obtenerExposicionRuta).mockResolvedValue(null)
    const { GET } = await import('./route')
    const res = await GET(req(), ctx('CUE-1'))
    expect(res.status).toBe(200)
    expect((await res.json()).disponible).toBe(false)
  })
})
