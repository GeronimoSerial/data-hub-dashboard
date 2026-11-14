import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { and, count, gte, like } from 'drizzle-orm'
import { getDb, migrarDb } from '@/lib/db'
import { auditoriaEvento } from '@/lib/db/schema'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { getSessionUser } from '@/lib/session'
import { GET } from './route'

vi.mock('@/lib/session', () => ({ getSessionUser: vi.fn() }))

usarDbTemporal('ruta-auditoria-', { seed: false })
beforeAll(() => migrarDb())

const sesion = (user: unknown) => vi.mocked(getSessionUser).mockResolvedValue(user as never)
const admin = { id: 'admin-1', role: 'admin', banned: false }
const pedido = (query = '') => GET(new Request(`http://localhost/api/infraestructura/auditoria${query}`))

// La base puede ser compartida con otros archivos de prueba en paralelo: se cuentan solo
// eventos que apunten a esta ruta y sean posteriores al inicio de la prueba.
async function eventosDelVisor(desde: Date) {
  const [fila] = await getDb().select({ total: count() }).from(auditoriaEvento)
    .where(and(gte(auditoriaEvento.ocurridoEn, desde), like(auditoriaEvento.rutaPlantilla, '%/api/infraestructura/auditoria%')))
  return fila!.total
}

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset()
})

describe('GET /api/infraestructura/auditoria', () => {
  it('responde 401 sin sesión', async () => {
    sesion(null)
    const respuesta = await pedido()
    expect(respuesta.status).toBe(401)
    expect(await respuesta.json()).toEqual({ error: 'No autenticado' })
  })

  it('responde 403 a roles que no son admin y a cuentas bloqueadas', async () => {
    for (const user of [
      { id: 'e', role: 'editor', banned: false },
      { id: 'c', role: 'consulta', banned: false },
      { id: 'a', role: 'admin', banned: true },
    ]) {
      sesion(user)
      const respuesta = await pedido()
      expect(respuesta.status, user.role).toBe(403)
      expect(await respuesta.json()).toEqual({ error: 'No tiene acceso a este recurso' })
    }
  })

  it('responde 200 al admin con la forma { items, nextCursor } y sin caché', async () => {
    sesion(admin)
    const respuesta = await pedido()
    expect(respuesta.status).toBe(200)
    expect(respuesta.headers.get('Cache-Control')).toBe('private, no-store')
    const cuerpo = await respuesta.json()
    expect(Array.isArray(cuerpo.items)).toBe(true)
    expect(cuerpo.items.length).toBeLessThanOrEqual(50)
    expect(typeof cuerpo.nextCursor === 'string' || cuerpo.nextCursor === null).toBe(true)
  })

  it('responde 400 a filtros inválidos, sin importar el rol del llamador', async () => {
    sesion(admin)
    const invalidas = [
      '?limite=0',
      '?limite=101',
      '?cursor=invalid',
      '?desde=2026-10-19',
      '?desde=2026-10-19T12:00:00',
      '?desde=2026-10-19T12:00:00Z&hasta=2026-10-19T09:00:00-03:00',
      '?resultado=otro',
      '?usuario=alguien',
      '?actorId=uno&actorId=dos',
    ]
    for (const query of invalidas) {
      const respuesta = await pedido(query)
      expect(respuesta.status, query).toBe(400)
      expect(respuesta.headers.get('Cache-Control'), query).toBe('private, no-store')
      expect(await respuesta.json(), query).toEqual({ error: 'Filtros inválidos' })
    }
  })

  it('no crea un evento de auditoría por leer el visor', async () => {
    sesion(admin)
    const inicio = new Date()
    await pedido('?limite=5')
    await pedido('?limite=5')
    expect(await eventosDelVisor(inicio)).toBe(0)
  })
})
