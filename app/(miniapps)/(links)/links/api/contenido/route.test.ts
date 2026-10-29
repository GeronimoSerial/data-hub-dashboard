import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CONFIG_INICIAL } from '@/miniapps/links/lib/config'
import { esAdmin } from '@/miniapps/links/lib/admin'
import { cargarConfig } from '@/miniapps/links/lib/store'
import { PUT } from './route'

vi.mock('@/miniapps/links/lib/admin', () => ({ esAdmin: vi.fn() }))

beforeEach(() => vi.mocked(esAdmin).mockReset())

const valido = { ...CONFIG_INICIAL, titulo: 'Publicado', enlaces: [{ id: 'e1', titulo: 'Portal', descripcion: '', url: 'https://www.argentina.gob.ar' }] }
const put = (body: unknown, origin = 'https://a.mec.gob.ar') =>
  new Request('https://a.mec.gob.ar/links/api/contenido', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin, host: 'a.mec.gob.ar' },
    body: JSON.stringify(body),
  })

describe('PUT /links/api/contenido', () => {
  it('sin sesión responde 401 y no guarda nada', async () => {
    vi.mocked(esAdmin).mockResolvedValue(false)
    expect((await PUT(put(valido))).status).toBe(401)
    expect((await cargarConfig()).titulo).not.toBe('Publicado')
  })

  it('rechaza otro origen aunque haya sesión', async () => {
    vi.mocked(esAdmin).mockResolvedValue(true)
    expect((await PUT(put(valido, 'https://evil.com'))).status).toBe(403)
  })

  it('con sesión guarda el contenido válido', async () => {
    vi.mocked(esAdmin).mockResolvedValue(true)
    const res = await PUT(put(valido))
    expect(res.status).toBe(200)
    expect((await cargarConfig()).titulo).toBe('Publicado')
  })

  it('con sesión rechaza contenido inválido con detalle y sin guardar', async () => {
    vi.mocked(esAdmin).mockResolvedValue(true)
    const res = await PUT(put({ ...valido, titulo: 'No debe guardarse', enlaces: [{ id: 'x', titulo: 'Malo', descripcion: '', url: 'javascript:alert(1)' }] }))
    expect(res.status).toBe(400)
    expect(((await res.json()) as { detalles: unknown[] }).detalles.length).toBeGreaterThan(0)
    expect((await cargarConfig()).titulo).toBe('Publicado')
  })
})
