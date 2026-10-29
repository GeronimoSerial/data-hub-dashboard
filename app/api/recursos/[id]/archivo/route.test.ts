import { Readable } from 'node:stream'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(), getDb: vi.fn(), stat: vi.fn(), readFile: vi.fn(),
  createReadStream: vi.fn(), set: vi.fn(), writeFile: vi.fn(),
}))
vi.mock('@/lib/session', () => ({ getSessionUser: mocks.getSessionUser, staffGuard: (u: { role: string } | null) => u?.role === 'admin' ? null : { status: u ? 403 : 401, error: 'Denegado' } }))
vi.mock('@/lib/db/seed', () => ({ ensureSeeded: vi.fn() }))
vi.mock('@/lib/db', () => ({ getDb: mocks.getDb }))
vi.mock('node:fs', () => ({ createReadStream: mocks.createReadStream }))
vi.mock('node:fs/promises', () => ({ stat: mocks.stat, readFile: mocks.readFile, mkdir: vi.fn(), writeFile: mocks.writeFile, unlink: vi.fn() }))
vi.mock('@/lib/data-dir', () => ({ getUploadsDir: () => '/tmp/archivos-html-test-virtual' }))

import { GET, POST } from './route'

const ctx = { params: Promise.resolve({ id: 'html' }) }
const url = 'http://localhost/api/recursos/html/archivo?download=1'
const html = '<h1>Original</h1>'
let row: Record<string, unknown>
let user: Record<string, unknown> | null
let audience: Record<string, unknown>[]

describe('archivo endpoint (mocked DB and storage)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    row = { id: 'html', formato: 'reporte', ruta: null, estado: 'publicado', storageKey: 'html/uuid', mime: 'text/html', nombreOriginal: 'Informe ñ.html' }
    user = { id: 'reader', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [], hubPolicy: { enabledSections: ['reports'], landing: false } }
    audience = []
    mocks.getSessionUser.mockImplementation(async () => user)
    mocks.getDb.mockReturnValue({
      select: (fields?: unknown) => ({ from: () => ({ where: async () => fields && !('storageKey' in (fields as object)) ? audience : [row] }) }),
      update: () => ({ set: mocks.set.mockReturnValue({ where: async () => undefined }) }),
    })
    mocks.stat.mockResolvedValue({ isFile: () => true })
    mocks.readFile.mockResolvedValue(html)
    mocks.createReadStream.mockImplementation(() => Readable.from([Buffer.from(html)]))
  })

  it('returns 401 for unauthenticated downloads without reading storage', async () => {
    user = null
    const response = await GET(new Request(url), ctx)
    expect(response.status).toBe(401)
    expect(mocks.stat).not.toHaveBeenCalled()
  })
  it('returns 403 for resource audience restrictions', async () => {
    audience = [{ userId: 'someone-else', nivelJurisdiccionalId: 99 }]
    expect((await GET(new Request(url), ctx)).status).toBe(403)
    expect(mocks.stat).not.toHaveBeenCalled()
  })
  it('returns 403 for section restrictions', async () => {
    user!.hubPolicy = { enabledSections: ['maps'], landing: false }
    const response = await GET(new Request(url), ctx)
    expect(response.status).toBe(403)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  })
  it('downloads stored bytes with attachment, ASCII fallback and RFC 5987 name', async () => {
    const response = await GET(new Request(url), ctx)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Disposition')).toBe("attachment; filename=\"Informe _.html\"; filename*=UTF-8''Informe%20%C3%B1.html")
    expect(response.headers.get('Content-Type')).toBe('text/html')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(await response.text()).toBe(html)
    expect(mocks.readFile).not.toHaveBeenCalled()
  })
  it('uses the legacy storage name for downloads', async () => {
    row.nombreOriginal = null
    row.storageKey = 'html/antiguo.htm'
    expect((await GET(new Request(url), ctx)).headers.get('Content-Disposition')).toContain('filename="antiguo.htm"')
  })
  it('uses a safe HTML fallback when no original name exists', async () => {
    row.nombreOriginal = null
    expect((await GET(new Request(url), ctx)).headers.get('Content-Disposition')).toContain('filename="archivo.html"')
  })
  it('records original name and server upload timestamp', async () => {
    user!.role = 'admin'
    const body = new FormData()
    body.set('file', new File([html], 'original.html', { type: 'text/html' }))
    const before = Date.now()
    const response = await POST(new Request(url, { method: 'POST', body }), ctx)
    expect(response.status).toBe(200)
    const result = await response.json()
    expect(result.nombreOriginal).toBe('original.html')
    expect(Date.parse(result.cargadoEn)).toBeGreaterThanOrEqual(before)
    expect(Date.parse(result.cargadoEn)).toBeLessThanOrEqual(Date.now())
    expect(mocks.set).toHaveBeenCalledWith(expect.objectContaining({ nombreOriginal: result.nombreOriginal, cargadoEn: result.cargadoEn }))
  })
})
