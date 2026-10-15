import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionUser } from '@/lib/acl'
import { crearGetMapaInfraestructura } from './mapa-ruta'

const { ensureSeeded, verificarAccesoLectura } = vi.hoisted(() => ({
  ensureSeeded: vi.fn(),
  verificarAccesoLectura: vi.fn(),
}))

vi.mock('@/lib/db/seed', () => ({ ensureSeeded }))
vi.mock('@/lib/infraestructura/acceso-lectura', () => ({ verificarAccesoLectura }))

function usuario(role: SessionUser['role'], nivelJurIds: number[] = []): SessionUser {
  return {
    id: 'u1',
    role,
    banned: false,
    nivelJurIds,
    accesoRecursos: 'todos',
    recursoIds: [],
    cueAnexo: null,
  }
}

describe('crearGetMapaInfraestructura', () => {
  beforeEach(() => {
    ensureSeeded.mockReset().mockResolvedValue(undefined)
    verificarAccesoLectura.mockReset().mockResolvedValue({ ok: true, user: usuario('consulta') })
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
    expect(listar).toHaveBeenCalledWith({})
  })

  it('director_nivel recibe el filtro de sus niveles jurisdiccionales', async () => {
    verificarAccesoLectura.mockResolvedValue({ ok: true, user: usuario('director_nivel', [4, 9]) })
    const listar = vi.fn().mockResolvedValue({ escuelas: [] })
    const GET = crearGetMapaInfraestructura(listar)

    const response = await GET(new Request('http://localhost/api/mapas/infraestructura/escuelas'))

    expect(response.status).toBe(200)
    expect(listar).toHaveBeenCalledWith({ nivelesJurIds: [4, 9] })
  })

  it('operador_establecimiento recibe 403 y no se consulta nada', async () => {
    verificarAccesoLectura.mockResolvedValue({ ok: true, user: usuario('operador_establecimiento') })
    const listar = vi.fn()
    const GET = crearGetMapaInfraestructura(listar)

    const response = await GET(new Request('http://localhost/api/mapas/infraestructura/escuelas'))

    expect(response.status).toBe(403)
    expect(listar).not.toHaveBeenCalled()
  })
})
