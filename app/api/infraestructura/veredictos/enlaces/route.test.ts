vi.mock('@/lib/infraestructura/auditoria/servidor', () => ({
  conAuditoria: (_accion: string, _ruta: string, ejecutar: unknown) => ejecutar,
  respuestaAuditada: (ejecutar: () => Promise<Response>) => ejecutar(),
}))

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Ruta from './route'
import { crearEnlace, revocarEnlacesDelDia } from '@/lib/infraestructura/veredicto/enlaces'
import { getSessionUser } from '@/lib/session'

// Factory puro para no arrastrar @/lib/session -> @/lib/db antes de fijar DATA_DIR.
vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
  staffGuard: (user: { banned: boolean; role: string } | null) => {
    if (!user) return { status: 401 as const, error: 'No autenticado' }
    if (user.banned || (user.role !== 'admin' && user.role !== 'editor')) {
      return { status: 403 as const, error: 'No tiene acceso a este recurso' }
    }
    return null
  },
}))

vi.mock('@/lib/db/seed', () => ({
  ensureSeeded: vi.fn(),
}))

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(() => ({ fake: true })),
}))

vi.mock('@/lib/infraestructura/veredicto/enlaces', () => ({
  crearEnlace: vi.fn(),
  revocarEnlacesDelDia: vi.fn(),
}))

let POST: typeof Ruta.POST
let DELETE: typeof Ruta.DELETE
beforeAll(async () => {
  const modulo = await import('./route')
  POST = modulo.POST
  DELETE = modulo.DELETE
})

const STAFF = { id: 'user-1', role: 'admin', banned: false } as never

function peticion(body?: unknown): Request {
  return new Request('http://localhost/api/infraestructura/veredictos/enlaces', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(crearEnlace).mockResolvedValue({
    id: 'enlace-1',
    token: 'tok-abc',
    venceEn: '2026-10-13T02:59:59.999Z',
  })
  vi.mocked(revocarEnlacesDelDia).mockResolvedValue(2)
})

describe('POST /api/infraestructura/veredictos/enlaces', () => {
  it('401 sin sesión', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const res = await POST(peticion({ desde: '2026-10-05', hasta: '2026-10-12' }))
    expect(res.status).toBe(401)
    expect(crearEnlace).not.toHaveBeenCalled()
  })

  it('403 para un usuario sin rol staff', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: 'u', role: 'consulta', banned: false } as never)
    const res = await POST(peticion({ desde: '2026-10-05', hasta: '2026-10-12' }))
    expect(res.status).toBe(403)
    expect(crearEnlace).not.toHaveBeenCalled()
  })

  it('400 con fecha con formato inválido', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(STAFF)
    const res = await POST(peticion({ desde: '05/10/2026', hasta: '2026-10-12' }))
    expect(res.status).toBe(400)
    expect(crearEnlace).not.toHaveBeenCalled()
  })

  it('400 si desde es posterior a hasta', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(STAFF)
    const res = await POST(peticion({ desde: '2026-10-12', hasta: '2026-10-05' }))
    expect(res.status).toBe(400)
  })

  it('400 si el rango supera 31 días', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(STAFF)
    const res = await POST(peticion({ desde: '2026-01-01', hasta: '2026-02-01' }))
    expect(res.status).toBe(400)
    expect(crearEnlace).not.toHaveBeenCalled()
  })

  it('201 con url y venceEn, guardando el enlace con el id del usuario', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(STAFF)
    const res = await POST(peticion({ desde: '2026-10-05', hasta: '2026-10-12' }))
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({
      url: '/veredicto/compartido/tok-abc',
      venceEn: '2026-10-13T02:59:59.999Z',
    })
    expect(crearEnlace).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ desde: '2026-10-05', hasta: '2026-10-12', creadoPor: 'user-1' }),
    )
  })

  it('usa la ventana por defecto cuando el body no trae fechas', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(STAFF)
    const res = await POST(peticion({}))
    expect(res.status).toBe(201)
    const args = vi.mocked(crearEnlace).mock.calls[0]![1]
    expect(args.desde).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(args.hasta).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(args.desde <= args.hasta).toBe(true)
  })
})

describe('DELETE /api/infraestructura/veredictos/enlaces', () => {
  it('401 sin sesión', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const res = await DELETE()
    expect(res.status).toBe(401)
    expect(revocarEnlacesDelDia).not.toHaveBeenCalled()
  })

  it('403 para un usuario baneado', async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: 'u', role: 'admin', banned: true } as never)
    const res = await DELETE()
    expect(res.status).toBe(403)
  })

  it('200 con el número de enlaces revocados', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(STAFF)
    const res = await DELETE()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ revocados: 2 })
    expect(revocarEnlacesDelDia).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ revocadoPor: 'user-1' }),
    )
  })
})
