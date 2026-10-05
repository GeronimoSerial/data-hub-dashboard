import { beforeEach, describe, expect, it, vi } from 'vitest'
import { crearGetMapaInfraestructura } from './mapa-ruta'

const { ensureSeeded, verificarAccesoLectura } = vi.hoisted(() => ({
  ensureSeeded: vi.fn(),
  verificarAccesoLectura: vi.fn(),
}))

vi.mock('@/lib/db/seed', () => ({ ensureSeeded }))
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({ verificarAccesoLectura }))

describe('crearGetMapaInfraestructura', () => {
  beforeEach(() => {
    ensureSeeded.mockReset().mockResolvedValue(undefined)
    verificarAccesoLectura.mockReset().mockResolvedValue({ ok: true })
  })

  it('ignora los parámetros de filtros y llama a listar sin argumentos', async () => {
    const listar = vi.fn().mockResolvedValue({ resultado: 'completo' })
    const GET = crearGetMapaInfraestructura(listar)
    const request = new Request(
      'http://localhost/api/mapas/infraestructura?territorio=ER&nivel=PRIMARIA&establecimiento=1801605-04&motivo=Inundación&severidad=Alta&categoria=establecimiento&servicio=suspendido',
    )

    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(listar).toHaveBeenCalledOnce()
    expect(listar).toHaveBeenCalledWith()
  })
})
