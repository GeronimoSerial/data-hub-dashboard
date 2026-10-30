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

const usuario: SessionUser = {
  id: 'u1',
  role: 'consulta',
  banned: false,
  nivelJurIds: [],
  accesoRecursos: 'todos',
  recursoIds: [],
}

const accesoPublico: RecursoAccess = { id: 'recurso-reorganizacion', estado: 'publicado', audienciaNivelJurIds: [], audienciaUserIds: [] }
const recursoPublico = { id: 'recurso-reorganizacion', access: accesoPublico }

function pedido() {
  return new Request('http://localhost/api/mapas/reorganizacion/datos')
}

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
  vi.mocked(loadRecursoAccessByRuta).mockReset()
  vi.mocked(loadRecursoAccessByRuta).mockResolvedValue(recursoPublico)
  vi.mocked(getSessionUser).mockResolvedValue(usuario)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('GET /api/mapas/reorganizacion/datos', () => {
  it('rechaza sin sesión y no expone datos de escuelas', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const res = await GET(pedido())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body).toEqual({ error: 'No autenticado' })
    expect(body.escuelas).toBeUndefined()
  })

  it('rechaza a un usuario sin audiencia y no expone datos de escuelas', async () => {
    vi.mocked(loadRecursoAccessByRuta).mockResolvedValue({
      id: 'recurso-reorganizacion',
      access: { id: 'recurso-reorganizacion', estado: 'publicado', audienciaNivelJurIds: [2], audienciaUserIds: [] } satisfies RecursoAccess,
    })
    vi.mocked(getSessionUser).mockResolvedValue({ ...usuario, nivelJurIds: [3] })
    const res = await GET(pedido())
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.escuelas).toBeUndefined()
    expect(body.referencias).toBeUndefined()
  })

  it('rechaza si el recurso no está dado de alta', async () => {
    vi.mocked(loadRecursoAccessByRuta).mockResolvedValue(null)
    const res = await GET(pedido())
    expect(res.status).toBe(403)
  })

  it('responde el dataset V29 con cabeceras privadas para usuarios con acceso', async () => {
    const res = await GET(pedido())
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const body = await res.json()
    expect(body.version).toBe('V29')
    expect(body.escuelas).toHaveLength(265)
  })

  it('aplica el límite de pedidos por IP', async () => {
    let estado: number | null = null
    for (let i = 0; i < 40 && estado !== 429; i++) {
      estado = (await GET(pedido())).status
    }
    expect(estado).toBe(429)
  })
})
