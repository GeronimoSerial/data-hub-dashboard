vi.mock('@/lib/infraestructura/auditoria/servidor', () => ({
  conAuditoria: (_accion: string, _ruta: string, ejecutar: unknown) => ejecutar,
  respuestaAuditada: (ejecutar: () => Promise<Response>) => ejecutar(),
}))

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Ruta from './route'
import type { FilaVeredicto } from '@/lib/infraestructura/veredicto/repositorio'
import { resolverEnlace } from '@/lib/infraestructura/veredicto/enlaces'
import { listarVigentes } from '@/lib/infraestructura/veredicto/repositorio'
import { generarPdfVeredictos } from '@/lib/infraestructura/veredicto/pdf'
import { cargarEventosTerreno } from '@/lib/infraestructura/veredicto/eventos-terreno'

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(() => ({ fake: true })),
}))

vi.mock('@/lib/infraestructura/veredicto/enlaces', () => ({
  resolverEnlace: vi.fn(),
}))

vi.mock('@/lib/infraestructura/veredicto/repositorio', () => ({
  listarVigentes: vi.fn(),
}))

vi.mock('@/lib/infraestructura/veredicto/eventos-terreno', () => ({
  cargarEventosTerreno: vi.fn(),
}))
vi.mock('@/lib/infraestructura/veredicto/pdf', () => ({
  generarPdfVeredictos: vi.fn(),
}))

let GET: typeof Ruta.GET
beforeAll(async () => { GET = (await import('./route')).GET })

const FILA = {
  id: 'ver-1',
  fecha: '2026-10-12',
  ambito: 'provincia',
  tipoDia: 'observado',
  nivel: 'sin_senal',
  trazaReglas: { reglas: [] },
  metricas: { metricas: [] },
  cobertura: { fuentesAusentes: [] },
  textoFinal: 'Texto',
  salidaIa: null,
  fuente: 'plantilla',
  motivoFallback: null,
  modelo: null,
  versionPrompt: null,
  tokensEntrada: null,
  tokensSalida: null,
  costoUsd: null,
  latenciaMs: null,
  enCalibracion: false,
  generadoEn: '2026-10-13T09:00:00.000Z',
  cerrado: false,
  inputsHash: 'h',
  jobRunId: null,
  reemplazadoPor: null,
} as unknown as FilaVeredicto

const BYTES = new Uint8Array([37, 80, 68, 70])

function req() {
  return new Request('http://localhost/api/veredicto/compartido/tok-1/pdf')
}

function ctx(token: string) {
  return { params: Promise.resolve({ token }) }
}

beforeEach(() => {
  vi.mocked(resolverEnlace).mockReset()
  vi.mocked(listarVigentes).mockReset()
  vi.mocked(listarVigentes).mockResolvedValue([FILA])
  vi.mocked(generarPdfVeredictos).mockReset()
  vi.mocked(generarPdfVeredictos).mockResolvedValue(BYTES)
  vi.mocked(cargarEventosTerreno).mockReset()
  vi.mocked(cargarEventosTerreno).mockResolvedValue([])
})

describe('GET /api/veredicto/compartido/[token]/pdf', () => {
  it('responde 404 para un token inexistente, sin datos', async () => {
    vi.mocked(resolverEnlace).mockResolvedValue({ estado: 'inexistente' })
    const res = await GET(req(), ctx('nope'))
    expect(res.status).toBe(404)
    expect(res.headers.get('Content-Type')).toContain('application/json')
    expect(vi.mocked(listarVigentes)).not.toHaveBeenCalled()
    expect(vi.mocked(generarPdfVeredictos)).not.toHaveBeenCalled()
  })

  it('responde 410 para un enlace vencido sin entregar datos', async () => {
    vi.mocked(resolverEnlace).mockResolvedValue({ estado: 'vencido', venceEn: '2026-10-12T02:59:59.999Z' })
    const res = await GET(req(), ctx('tok-1'))
    expect(res.status).toBe(410)
    expect((await res.json()).error).toBe('Enlace vencido o revocado')
    expect(vi.mocked(generarPdfVeredictos)).not.toHaveBeenCalled()
  })

  it('responde 410 para un enlace revocado sin entregar datos', async () => {
    vi.mocked(resolverEnlace).mockResolvedValue({ estado: 'revocado' })
    const res = await GET(req(), ctx('tok-1'))
    expect(res.status).toBe(410)
    expect((await res.json()).error).toBe('Enlace vencido o revocado')
    expect(vi.mocked(listarVigentes)).not.toHaveBeenCalled()
  })

  it('entrega el PDF del rango del enlace con cabeceras de adjunto y noindex', async () => {
    vi.mocked(resolverEnlace).mockResolvedValue({
      estado: 'valido', desde: '2026-10-01', hasta: '2026-10-05', venceEn: '2026-10-13T02:59:59.999Z',
    })
    const res = await GET(req(), ctx('tok-1'))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="veredicto-2026-10-01-a-2026-10-05.pdf"',
    )
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(BYTES)
    expect(vi.mocked(listarVigentes)).toHaveBeenCalledWith({ fake: true }, { desde: '2026-10-01', hasta: '2026-10-05' })
  })
})
