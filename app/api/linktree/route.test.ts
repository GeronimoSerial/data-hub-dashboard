import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Route from './route'
import { getSessionUser } from '@/lib/session'
import { CONFIG_INICIAL } from '@/lib/linktree/config'
import { cargarConfig } from '@/lib/linktree/store'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))

let GET: typeof Route.GET
let PUT: typeof Route.PUT

beforeAll(async () => {
  ;({ GET, PUT } = await import('./route'))
})

beforeEach(() => vi.mocked(getSessionUser).mockReset())

function usuario(role: 'admin' | 'editor' | 'consulta', banned = false) {
  return {
    id: `${role}-1`, role, banned, nivelJurIds: [],
    accesoRecursos: 'todos' as const, recursoIds: [],
  }
}

function get() {
  return GET(new Request('http://localhost/api/linktree'))
}

function put(body: unknown) {
  return PUT(new Request('http://localhost/api/linktree', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }))
}

const valido = { ...CONFIG_INICIAL, titulo: 'Sistemas de Corrientes' }

describe('/api/linktree', () => {
  it('responde 401 sin sesión, en lectura y en escritura', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null)
    expect((await get()).status).toBe(401)
    expect((await put(valido)).status).toBe(401)
  })

  it.each([
    ['editor', usuario('editor')],
    ['consulta', usuario('consulta')],
    ['admin suspendido', usuario('admin', true)],
  ])('responde 403 para %s y no guarda nada', async (_nombre, user) => {
    vi.mocked(getSessionUser).mockResolvedValue(user)
    expect((await get()).status).toBe(403)
    expect((await put(valido)).status).toBe(403)
    expect((await cargarConfig()).titulo).toBe(CONFIG_INICIAL.titulo)
  })

  it('rechaza con 400 un cuerpo que no es JSON', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(usuario('admin'))
    expect((await put('{no es json')).status).toBe(400)
  })

  it('rechaza con 400 una URL javascript: y no guarda', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(usuario('admin'))
    const respuesta = await put({
      ...valido,
      grupos: [{
        id: 'g1', titulo: 'Datos',
        enlaces: [{ id: 'e1', titulo: 'X', descripcion: '', url: 'javascript:alert(1)', icono: null, visible: true }],
      }],
    })
    expect(respuesta.status).toBe(400)
    const cuerpo = await respuesta.json()
    expect(cuerpo.detalles[0].ruta).toBe('grupos.0.enlaces.0.url')
    expect((await cargarConfig()).grupos).toEqual([])
  })

  it('guarda para el admin y lo devuelve en la lectura', async () => {
    vi.mocked(getSessionUser).mockResolvedValue(usuario('admin'))
    const guardado = await put(valido)
    expect(guardado.status).toBe(200)
    expect(guardado.headers.get('cache-control')).toBe('private, no-store')
    const lectura = await get()
    expect(lectura.status).toBe(200)
    expect(await lectura.json()).toEqual(valido)
  })
})
