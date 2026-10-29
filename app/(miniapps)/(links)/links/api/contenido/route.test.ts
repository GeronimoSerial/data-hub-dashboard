import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONFIG_INICIAL } from '@/miniapps/links/lib/config'
import { usuarioAdmin } from '@/miniapps/links/lib/admin'
import { getDb, migrarDb } from '@/lib/db'
import { linktreeConfig } from '@/lib/db/schema'
import { cargarConfig } from '@/miniapps/links/lib/store'
import { PUT } from './route'

vi.mock('@/miniapps/links/lib/admin', () => ({ usuarioAdmin: vi.fn() }))

beforeAll(() => migrarDb())
beforeEach(async () => {
  vi.mocked(usuarioAdmin).mockReset()
  await getDb().delete(linktreeConfig)
})

const valido = { ...CONFIG_INICIAL, titulo: 'Publicado', enlaces: [{ id: 'e1', titulo: 'Portal', descripcion: '', url: 'https://www.argentina.gob.ar' }] }
const put = (body: unknown, origin = 'https://a.mec.gob.ar') =>
  new Request('https://a.mec.gob.ar/links/api/contenido', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin, host: 'a.mec.gob.ar' },
    body: JSON.stringify(body),
  })

describe('PUT /links/api/contenido', () => {
  it('sin sesión responde 401 y no guarda nada', async () => {
    vi.mocked(usuarioAdmin).mockResolvedValue(null)
    expect((await PUT(put(valido))).status).toBe(401)
    expect((await cargarConfig()).titulo).not.toBe('Publicado')
  })

  it('rechaza otro origen aunque haya sesión', async () => {
    vi.mocked(usuarioAdmin).mockResolvedValue('editor')
    expect((await PUT(put(valido, 'https://evil.com'))).status).toBe(403)
  })

  it('con sesión guarda el contenido válido', async () => {
    vi.mocked(usuarioAdmin).mockResolvedValue('editor')
    const res = await PUT(put(valido))
    expect(res.status).toBe(200)
    expect((await cargarConfig()).titulo).toBe('Publicado')
  })

  it('con sesión rechaza contenido inválido con detalle y sin guardar', async () => {
    vi.mocked(usuarioAdmin).mockResolvedValue('editor')
    const res = await PUT(put({ ...valido, titulo: 'No debe guardarse', enlaces: [{ id: 'x', titulo: 'Malo', descripcion: '', url: 'javascript:alert(1)' }] }))
    expect(res.status).toBe(400)
    expect(((await res.json()) as { detalles: unknown[] }).detalles.length).toBeGreaterThan(0)
    expect((await cargarConfig()).titulo).not.toBe('No debe guardarse')
  })
})


it('devuelve 409 sin sobrescribir y conserva autor del ganador', async () => {
  vi.mocked(usuarioAdmin).mockResolvedValue('ana')
  expect((await PUT(put(valido))).status).toBe(200)
  vi.mocked(usuarioAdmin).mockResolvedValue('bea')
  const conflicto = await PUT(put({ ...valido, titulo: 'Viejo' }))
  expect(conflicto.status).toBe(409)
  const [fila] = await getDb().select().from(linktreeConfig)
  expect(fila.actualizadoPor).toBe('ana')
  expect((await cargarConfig()).titulo).toBe('Publicado')
})
it('requiere revisión explícita', async () => {
  vi.mocked(usuarioAdmin).mockResolvedValue('ana')
  const { revision: _revision, ...sinRevision } = valido
  expect((await PUT(put(sinRevision))).status).toBe(400)
})
it('limita tamaño de PUT', async () => {
  vi.mocked(usuarioAdmin).mockResolvedValue('ana')
  expect((await PUT(put({ ...valido, titulo: 'x'.repeat(512 * 1024) }))).status).toBe(413)
})
