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
      return { status: 403 as const, error: 'No tenés acceso a este recurso' }
    }
    return null
  },
}))

let dir: string
let prevDataDir: string | undefined

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'motivos-route-'))
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

function admin() {
  return { id: 'admin-1', role: 'admin' as const, banned: false, nivelIds: [] }
}
function editor() {
  return { id: 'editor-1', role: 'editor' as const, banned: false, nivelIds: [] }
}
function consulta() {
  return { id: 'consulta-1', role: 'consulta' as const, banned: false, nivelIds: [] }
}

function postReq(body: unknown) {
  return new Request('http://localhost/api/infraestructura/motivos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
function deleteReq(id: string) {
  return new Request(`http://localhost/api/infraestructura/motivos?id=${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

describe('GET /api/infraestructura/motivos', () => {
  it('rechaza sin sesión con 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('rechaza a consulta con 403', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(consulta())
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('admite a editor (staff) y devuelve los motivos ordenados', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { GET } = await import('./route')
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data.motivos)).toBe(true)
    expect(data.motivos.length).toBeGreaterThan(0)
    expect(data.motivos.some((m: { nombre: string }) => m.nombre === 'Inundación')).toBe(true)
  })
})

describe('POST /api/infraestructura/motivos', () => {
  it('rechaza sin sesión con 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const { POST } = await import('./route')
    const res = await POST(postReq({ id: 'x', nombre: 'X', categoria: 'establecimiento', orden: 1 }))
    expect(res.status).toBe(401)
  })

  it('rechaza a un editor (no admin) con 403', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { POST } = await import('./route')
    const res = await POST(postReq({ id: 'x', nombre: 'X', categoria: 'establecimiento', orden: 1 }))
    expect(res.status).toBe(403)
  })

  it('admite a admin y hace upsert por id', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(admin())
    const { POST, GET } = await import('./route')

    const alta = await POST(
      postReq({ id: 'corte-de-ruta', nombre: 'Corte de ruta', categoria: 'establecimiento', orden: 50 }),
    )
    expect(alta.status).toBe(200)

    const actualizacion = await POST(
      postReq({ id: 'corte-de-ruta', nombre: 'Corte de ruta (actualizado)', categoria: 'alumnos', orden: 60 }),
    )
    expect(actualizacion.status).toBe(200)

    const listado = await GET()
    const data = await listado.json()
    const fila = data.motivos.find((m: { id: string }) => m.id === 'corte-de-ruta')
    expect(fila.nombre).toBe('Corte de ruta (actualizado)')
    expect(fila.categoria).toBe('alumnos')
  })

  it('rechaza nombre vacío', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(admin())
    const { POST } = await import('./route')
    const res = await POST(postReq({ id: 'vacio', nombre: '', categoria: 'establecimiento', orden: 1 }))
    expect(res.status).toBe(400)
  })

  it('rechaza categoría fuera del catálogo fijo', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(admin())
    const { POST } = await import('./route')
    const res = await POST(postReq({ id: 'x2', nombre: 'X2', categoria: 'inventada', orden: 1 }))
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/infraestructura/motivos', () => {
  it('rechaza sin sesión con 401', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    const { DELETE } = await import('./route')
    const res = await DELETE(deleteReq('inundacion'))
    expect(res.status).toBe(401)
  })

  it('rechaza a un editor (no admin) con 403', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(editor())
    const { DELETE } = await import('./route')
    const res = await DELETE(deleteReq('inundacion'))
    expect(res.status).toBe(403)
  })

  it('bloquea la eliminación si hay problemáticas asociadas', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(admin())
    const { getDb } = await import('@/lib/db')
    const { infraProblematica } = await import('@/lib/db/schema')
    const db = getDb()
    await db.insert(infraProblematica).values({
      id: 'prob-motivo-en-uso',
      cueAnexo: '1801605-04',
      motivo: 'Inundación',
      categoria: 'establecimiento',
      severidad: 'Alta',
      corteId: 1,
      creadaEn: new Date().toISOString(),
      idempotencyKey: 'k-motivo-en-uso',
      origen: 'enlace-cue',
    })

    const { DELETE } = await import('./route')
    const res = await DELETE(deleteReq('inundacion'))
    expect(res.status).toBe(400)
  })

  it('admite a admin eliminar un motivo sin uso', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(admin())
    const { POST, DELETE } = await import('./route')

    await POST(postReq({ id: 'sin-uso', nombre: 'Sin uso', categoria: 'establecimiento', orden: 99 }))
    const res = await DELETE(deleteReq('sin-uso'))
    expect(res.status).toBe(200)
  })
})
