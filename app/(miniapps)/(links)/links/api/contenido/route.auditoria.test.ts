import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONFIG_INICIAL } from '@/miniapps/links/lib/config'
import { usuarioAdmin } from '@/miniapps/links/lib/admin'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb, migrarDb } from '@/lib/db'
import { auditoriaEvento, linktreeConfig } from '@/lib/db/schema'
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

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

describe('auditoría del contenido de links', () => {
  it('publicar contenido deja un evento links.contenido_modificar con la revisión nueva', async () => {
    vi.mocked(usuarioAdmin).mockResolvedValue('editor')
    const res = await PUT(put(valido))
    expect(res.status).toBe(200)

    expect(await eventoDe(res)).toMatchObject({
      accion: 'links.contenido_modificar',
      metodo: 'PUT',
      rutaPlantilla: '/links/api/contenido',
      actorTipo: 'compartido',
      actorId: 'editor',
      viaAcceso: 'sesion_links',
      objetoTipo: 'linktree',
      objetoId: 'config',
      resultado: 'exito',
      httpStatus: 200,
      metadatos: { revision: 1 },
    })
  })

  it('el evento no guarda el título ni el contenido publicado', async () => {
    vi.mocked(usuarioAdmin).mockResolvedValue('editor')
    const titulo = `Secreto ${randomUUID()}`
    const res = await PUT(put({ ...valido, titulo }))
    expect(res.status).toBe(200)
    const serializado = JSON.stringify(await eventoDe(res))
    expect(serializado).not.toContain(titulo)
    expect(serializado).not.toContain('argentina.gob.ar')
  })

  it('sin sesión deja un evento rechazado de actor anónimo y no guarda nada', async () => {
    vi.mocked(usuarioAdmin).mockResolvedValue(null)
    const res = await PUT(put(valido))
    expect(res.status).toBe(401)
    expect(await eventoDe(res)).toMatchObject({
      actorTipo: 'anonimo',
      actorId: null,
      resultado: 'rechazado',
      httpStatus: 401,
    })
    expect(await cargarConfig()).toMatchObject({ revision: 0 })
  })

  it('otro origen deja un evento rechazado y no guarda nada', async () => {
    vi.mocked(usuarioAdmin).mockResolvedValue('editor')
    const res = await PUT(put(valido, 'https://evil.com'))
    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'rechazado', httpStatus: 403 })
    expect(await cargarConfig()).toMatchObject({ revision: 0 })
  })

  it('contenido inválido deja un evento invalido y no guarda nada', async () => {
    vi.mocked(usuarioAdmin).mockResolvedValue('editor')
    const res = await PUT(put({ ...valido, titulo: 'No debe guardarse', enlaces: [{ id: 'x', titulo: 'Malo', descripcion: '', url: 'javascript:alert(1)' }] }))
    expect(res.status).toBe(400)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'invalido', httpStatus: 400 })
    expect(await cargarConfig()).toMatchObject({ revision: 0 })
  })

  it('una revisión vencida deja un evento conflicto y no sobrescribe', async () => {
    vi.mocked(usuarioAdmin).mockResolvedValue('ana')
    expect((await PUT(put(valido))).status).toBe(200)
    vi.mocked(usuarioAdmin).mockResolvedValue('bea')
    const res = await PUT(put({ ...valido, titulo: 'Viejo' }))
    expect(res.status).toBe(409)
    expect(await eventoDe(res)).toMatchObject({
      actorId: 'bea',
      resultado: 'conflicto',
      httpStatus: 409,
    })
    expect((await cargarConfig()).titulo).toBe('Publicado')
  })

  it('si la auditoría no puede guardarse responde 503 y el contenido no se publica', async () => {
    vi.mocked(usuarioAdmin).mockResolvedValue('editor')
    const res = await conFalloAuditoria(() => PUT(put(valido)))
    expect(res.status).toBe(503)
    expect(((await res.json()) as { code: string }).code).toBe('auditoria_no_disponible')
    expect(await cargarConfig()).toMatchObject({ revision: 0 })
  })
})
