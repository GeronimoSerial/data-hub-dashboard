import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Route from './route'
import { getSessionUser } from '@/lib/session'
import { CONFIG_INICIAL, LIMITES } from '@/lib/linktree/config'
import { cargarConfig, guardarConfig } from '@/lib/linktree/store'

vi.mock('@/lib/session', () => ({
  getSessionUser: vi.fn(),
  staffGuard: (user: { role: string; banned: boolean } | null) =>
    !user ? { status: 401, error: 'No autenticado' }
      : user.banned || !['admin', 'editor'].includes(user.role) ? { status: 403, error: 'No tiene acceso a este recurso' }
        : null,
}))

let POST: typeof Route.POST

beforeAll(async () => {
  ;({ POST } = await import('./route'))
})

beforeEach(async () => {
  vi.mocked(getSessionUser).mockReset()
  await guardarConfig(CONFIG_INICIAL, 'seed')
})

function usuario(role: string, banned = false) {
  return { id: `${role}-1`, role, banned, nivelJurIds: [], accesoRecursos: 'todos' as const, recursoIds: [] }
}

function post(body: unknown) {
  return POST(new Request('http://localhost/api/linktree/enlaces', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }))
}

const valido = { url: 'https://becas.mec.gob.ar', descripcion: 'Portal de becas' }

describe('POST /api/linktree/enlaces', () => {
  it('responde 401 sin sesión', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    expect((await post(valido)).status).toBe(401)
  })

  it.each([
    ['consulta', usuario('consulta')],
    ['operador de establecimiento', usuario('operador_establecimiento')],
    ['editor suspendido', usuario('editor', true)],
  ])('responde 403 para %s y no guarda nada', async (_nombre, user) => {
    vi.mocked(getSessionUser).mockResolvedValue(user as never)
    expect((await post(valido)).status).toBe(403)
    expect((await cargarConfig()).grupos).toEqual([])
  })

  it('rechaza con 400 un cuerpo que no es JSON', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(usuario('editor') as never)
    expect((await post('{roto')).status).toBe(400)
  })

  it.each([
    [{ url: 'javascript:alert(1)', descripcion: 'x' }],
    [{ url: 'https://becas.mec.gob.ar', descripcion: '   ' }],
    [{ url: 'https://becas.mec.gob.ar' }],
  ])('rechaza con 400 %j y no guarda', async (cuerpo) => {
    vi.mocked(getSessionUser).mockResolvedValue(usuario('editor') as never)
    expect((await post(cuerpo)).status).toBe(400)
    expect((await cargarConfig()).grupos).toEqual([])
  })

  it('permite agregar a un editor: crea el grupo Accesos y luego suma al mismo', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(usuario('editor') as never)
    const primera = await post(valido)
    expect(primera.status).toBe(201)
    expect(await primera.json()).toMatchObject({ enlace: { titulo: 'Portal de becas', url: 'https://becas.mec.gob.ar' } })
    await post({ url: '/mapas', descripcion: 'Mapas' })
    const { grupos } = await cargarConfig()
    expect(grupos).toHaveLength(1)
    expect(grupos[0].titulo).toBe('Accesos')
    expect(grupos[0].enlaces.map((e) => e.titulo)).toEqual(['Portal de becas', 'Mapas'])
    expect(grupos[0].enlaces.every((e) => e.visible)).toBe(true)
  })

  it('permite agregar a un admin', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(usuario('admin') as never)
    expect((await post(valido)).status).toBe(201)
  })

  it('responde 409 con un mensaje claro cuando el primer grupo está lleno', async () => {
    const enlaces = Array.from({ length: LIMITES.enlacesPorGrupo }, (_, i) => ({
      id: `e${i}`, titulo: `E${i}`, descripcion: '', url: '/x', icono: null, visible: true,
    }))
    await guardarConfig({ ...CONFIG_INICIAL, grupos: [{ id: 'g1', titulo: 'Lleno', enlaces }] }, 'seed')
    vi.mocked(getSessionUser).mockResolvedValue(usuario('editor') as never)
    const respuesta = await post(valido)
    expect(respuesta.status).toBe(409)
    expect((await respuesta.json()).error).toMatch(/lugar/)
    expect((await cargarConfig()).grupos[0].enlaces).toHaveLength(LIMITES.enlacesPorGrupo)
  })
})
