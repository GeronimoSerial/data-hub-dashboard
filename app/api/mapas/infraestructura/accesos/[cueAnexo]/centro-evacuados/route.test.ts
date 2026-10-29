import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Ruta from './route'
import type { SessionUser } from '@/lib/acl'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { obtenerCentroEvacuados } from '@/lib/infraestructura/evacuacion/respuesta'

vi.mock('@/lib/db/seed', () => ({ ensureSeeded: vi.fn() }))
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({ verificarAccesoLectura: vi.fn() }))
vi.mock('@/lib/infraestructura/evacuacion/respuesta', () => ({ obtenerCentroEvacuados: vi.fn() }))

let GET: typeof Ruta.GET
beforeAll(async () => { GET = (await import('./route')).GET })

const usuario = (): SessionUser => ({ id: 'u-1', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos' as const, recursoIds: [] })
const ctx = (cueAnexo: string) => ({ params: Promise.resolve({ cueAnexo }) })
const req = (cueAnexo = '1800001-00') => new Request(`http://localhost/api/mapas/infraestructura/accesos/${cueAnexo}/centro-evacuados`)

describe('GET /api/mapas/infraestructura/accesos/[cueAnexo]/centro-evacuados', () => {
  beforeEach(() => {
    vi.mocked(verificarAccesoLectura).mockReset()
    vi.mocked(obtenerCentroEvacuados).mockReset()
  })

  it.each([[401, 'No autenticado'], [403, 'No tiene acceso a este recurso']] as const)('acceso denegado %i no toca el loader', async (status, error) => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: false, status })
    const res = await GET(req(), ctx('1800001-00'))
    expect(res.status).toBe(status)
    expect((await res.json()).error).toBe(error)
    expect(obtenerCentroEvacuados).not.toHaveBeenCalled()
  })

  it('con cueAnexo vacío responde 400 sin llamar al loader', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: true, user: usuario() })
    const res = await GET(req(''), ctx(''))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('cueAnexo inválido')
    expect(obtenerCentroEvacuados).not.toHaveBeenCalled()
  })

  it('sin dato responde 200 con disponible false (nunca 404) y sin caché compartida', async () => {
    vi.mocked(verificarAccesoLectura).mockResolvedValue({ ok: true, user: usuario() })
    vi.mocked(obtenerCentroEvacuados).mockResolvedValue({ cueAnexo: '1800001-00', apto: false, disponible: false, motivoSinDestino: 'sin_calculo' })
    const res = await GET(req(), ctx('1800001-00'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-cache')
    expect(await res.json()).toEqual({ cueAnexo: '1800001-00', apto: false, disponible: false, motivoSinDestino: 'sin_calculo' })
    expect(obtenerCentroEvacuados).toHaveBeenCalledWith('1800001-00')
  })
})
