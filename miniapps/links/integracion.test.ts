import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'
import { POST, DELETE } from '@/app/(miniapps)/(links)/links/api/sesion/route'
import { PUT } from '@/app/(miniapps)/(links)/links/api/contenido/route'
import { getDb, migrarDb } from '@/lib/db'
import { linktreeConfig } from '@/lib/db/schema'
import { CONFIG_INICIAL } from './lib/config'

const estado = vi.hoisted(() => ({ cookie: '' }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: estado.cookie }) }) }))
vi.mock('@/lib/db/seed', () => ({ ensureSeeded: () => { throw new Error('seed prohibido') } }))

beforeAll(() => migrarDb())
beforeEach(async () => {
  vi.stubEnv('LINKS_ADMIN_USERS', 'ana:clave-prueba,bea:otra-clave')
  vi.stubEnv('LINKS_SESSION_SECRET', 's'.repeat(40))
  estado.cookie = ''
  await getDb().delete(linktreeConfig)
})
afterEach(() => vi.unstubAllEnvs())
const request = (method: string, ruta: string, body?: unknown) => new Request(`https://links.sistemas.mec.gob.ar/cadm/api/${ruta}`, {
  method, headers: { host: 'links.sistemas.mec.gob.ar', origin: 'https://links.sistemas.mec.gob.ar', cookie: `links_admin=${estado.cookie}` },
  ...(body ? { body: JSON.stringify(body) } : {}),
})

it('CADM: login, guardar con identidad real, conflicto y revocación de la cookie copiada', async () => {
  const rew = middleware(new NextRequest('https://links.sistemas.mec.gob.ar/cadm/api/sesion', { method: 'POST' }))
  expect(rew.headers.get('x-middleware-rewrite')).toBe('https://links.sistemas.mec.gob.ar/links/api/sesion')
  const login = await POST(request('POST', 'sesion', { usuario: 'ana', clave: 'clave-prueba' }))
  expect(login.status).toBe(200)
  expect(login.headers.get('set-cookie')).toContain('Path=/cadm;')
  estado.cookie = login.headers.get('set-cookie')!.split(';')[0].split('=')[1]
  const guardado = await PUT(request('PUT', 'contenido', { ...CONFIG_INICIAL, titulo: 'Publicado por Ana' }))
  expect(guardado.status).toBe(200)
  expect(await guardado.json()).toMatchObject({ revision: 1 })
  const [fila] = await getDb().select().from(linktreeConfig)
  expect(fila.actualizadoPor).toBe('ana')
  expect((await PUT(request('PUT', 'contenido', CONFIG_INICIAL))).status).toBe(409)
  const logout = await DELETE(request('DELETE', 'sesion'))
  expect(logout.status).toBe(200)
  expect(logout.headers.get('set-cookie')).toContain('Path=/cadm; Max-Age=0')
  expect((await PUT(request('PUT', 'contenido', { ...CONFIG_INICIAL, revision: 1 }))).status).toBe(401)
})

it('el lector real deja de autorizar al cambiar clave o eliminar usuario', async () => {
  const login = await POST(request('POST', 'sesion', { usuario: 'ana', clave: 'clave-prueba' }))
  estado.cookie = login.headers.get('set-cookie')!.split(';')[0].split('=')[1]
  vi.stubEnv('LINKS_ADMIN_USERS', 'ana:nueva-clave,bea:otra-clave')
  expect((await PUT(request('PUT', 'contenido', CONFIG_INICIAL))).status).toBe(401)
  vi.stubEnv('LINKS_ADMIN_USERS', 'bea:otra-clave')
  expect((await PUT(request('PUT', 'contenido', CONFIG_INICIAL))).status).toBe(401)
})
