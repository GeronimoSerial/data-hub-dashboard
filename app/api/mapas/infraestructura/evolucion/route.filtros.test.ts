import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  acceso: { ok: true } as { ok: boolean; status?: number },
  obtenerEvolucionMapa: vi.fn(async (filtros?: { departamentos?: string[]; niveles?: string[] }) => ({
    serieEscuelasServicioCaido: [], rankingDepartamentos: [], distribucionMotivo: [], alumnosAcumulados: [], filtros,
  })),
}))

vi.mock('@/lib/db/seed', () => ({ ensureSeeded: vi.fn(async () => undefined) }))
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({ verificarAccesoLectura: vi.fn(async () => mocks.acceso) }))
vi.mock('@/lib/infraestructura/evolucion', () => ({ obtenerEvolucionMapa: mocks.obtenerEvolucionMapa }))

import { GET } from './route'

const req = (query = '') => new Request(`http://localhost/api/mapas/infraestructura/evolucion${query}`)

describe('GET /api/mapas/infraestructura/evolucion — filtros', () => {
  beforeEach(() => {
    mocks.acceso = { ok: true }
    mocks.obtenerEvolucionMapa.mockClear()
  })

  it('llama sin filtros cuando no hay parámetros', async () => {
    await GET(req())
    expect(mocks.obtenerEvolucionMapa).toHaveBeenCalledExactlyOnceWith()
  })

  it('pasa departamento y nivel validados', async () => {
    await GET(req('?departamento=Goya&nivel=Primario'))
    expect(mocks.obtenerEvolucionMapa).toHaveBeenCalledExactlyOnceWith({ departamentos: ['Goya'], niveles: ['Primario'] })
  })

  it('conserva los valores repetidos', async () => {
    await GET(req('?departamento=Goya&departamento=Esquina'))
    expect(mocks.obtenerEvolucionMapa).toHaveBeenCalledExactlyOnceWith({ departamentos: ['Goya', 'Esquina'] })
  })

  it.each(['?departamento=%20', `?nivel=${'x'.repeat(121)}`])('rechaza parámetros inválidos: %s', async (query) => {
    const response = await GET(req(query))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Parámetros inválidos' })
    expect(mocks.obtenerEvolucionMapa).not.toHaveBeenCalled()
  })

  it('respeta el acceso denegado', async () => {
    mocks.acceso = { ok: false, status: 403 }
    const response = await GET(req())
    expect(response.status).toBe(403)
    expect(mocks.obtenerEvolucionMapa).not.toHaveBeenCalled()
  })
})
