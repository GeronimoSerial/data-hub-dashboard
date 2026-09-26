import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSessionUser } from '@/lib/session'

// No usa importOriginal: el módulo real importa @/lib/auth -> @/lib/db, que
// llamaría getDb() (y cachearía la conexión) al cargar el módulo, ANTES de
// que el beforeAll de este archivo fije DATA_DIR. Reimplementa staffGuard acá
// mismo (misma lógica que lib/session.ts) para no arrastrar esa cadena.
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

let dir: string
let prevDataDir: string | undefined

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'episodios-id-route-'))
  prevDataDir = process.env.DATA_DIR
  process.env.DATA_DIR = dir

  const { ensureSeeded } = await import('@/lib/db/seed')
  await ensureSeeded()
})

afterAll(() => {
  if (prevDataDir === undefined) delete process.env.DATA_DIR
  else process.env.DATA_DIR = prevDataDir
  rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
})

function editor() {
  return { id: 'editor-1', role: 'editor' as const, banned: false, nivelIds: [] }
}
function consulta() {
  return { id: 'consulta-1', role: 'consulta' as const, banned: false, nivelIds: [] }
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) }
}

function patchReq(body: unknown) {
  return new Request('http://localhost/api/infraestructura/episodios/x', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function nuevoEpisodio() {
  const { crearEpisodio } = await import('@/lib/infraestructura/episodios')
  const { PERIODO_ENOS_2026_2027_ID } = await import('@/lib/db/seed')
  return crearEpisodio({ periodoId: PERIODO_ENOS_2026_2027_ID, nombre: 'Episodio de prueba' })
}

describe('PATCH /api/infraestructura/episodios/[id]', () => {
  it('cierra un episodio abierto y lo devuelve con estado cerrado', async () => {
    const episodio = await nuevoEpisodio()
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { PATCH } = await import('./route')
    const res = await PATCH(patchReq({ accion: 'cerrar' }), ctx(episodio.id))
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('private, no-store')
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.episodio.estado).toBe('cerrado')
  })

  it('devuelve 409 al cerrar un episodio ya cerrado', async () => {
    const episodio = await nuevoEpisodio()
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { PATCH } = await import('./route')
    await PATCH(patchReq({ accion: 'cerrar' }), ctx(episodio.id))
    const res = await PATCH(patchReq({ accion: 'cerrar' }), ctx(episodio.id))
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toBe('El episodio ya estaba cerrado')
  })

  it('devuelve 404 al cerrar un episodio inexistente', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { PATCH } = await import('./route')
    const res = await PATCH(patchReq({ accion: 'cerrar' }), ctx('no-existe'))
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('El episodio no existe')
  })

  it('rechaza a consulta (no staff) con 403', async () => {
    const episodio = await nuevoEpisodio()
    vi.mocked(getSessionUser).mockResolvedValue(consulta())
    const { PATCH } = await import('./route')
    const res = await PATCH(patchReq({ accion: 'cerrar' }), ctx(episodio.id))
    expect(res.status).toBe(403)
  })
})
