import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { getDb, migrarDb } from '@/lib/db'
import { auditoriaEvento } from '@/lib/db/schema'
import { actorAuditoria } from './contexto'
import { conAuditoria } from './servidor'

beforeAll(() => migrarDb())
afterEach(() => vi.restoreAllMocks())

const RUTA = '/api/problematicas/verificaciones/[id]'
const solicitud = () => new Request('https://example.test/api/problematicas/verificaciones/x', { method: 'POST' })

/** Responde con un handler que declara el actor indicado y devuelve la fila del evento por su requestId. */
async function eventoDeActor(actor: { actorId: string | null; actorRol: string | null }) {
  const handler = conAuditoria('verificacion.responder', RUTA, async (_request: Request) => {
    actorAuditoria({ actorTipo: 'enlace', actorId: actor.actorId, actorRol: actor.actorRol, viaAcceso: 'enlace' })
    return Response.json({ ok: true })
  })
  const response = await handler(solicitud())
  const requestId = response.headers.get('X-Request-Id')!
  const [evento] = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId))
  return { response, evento }
}

describe('actor de la auditoría sin texto arbitrario', () => {
  it('un actorId muy largo no provoca 503 y se guarda como null', async () => {
    const { response, evento } = await eventoDeActor({ actorId: 'a'.repeat(5000), actorRol: null })
    expect(response.status).toBe(200)
    expect(evento).toBeDefined()
    expect(evento.actorId).toBeNull()
  })

  it.each(['con espacios', '../../admin', 'x?token=x'])('un actorId fuera de las reglas (%s) se guarda como null', async actorId => {
    const { evento } = await eventoDeActor({ actorId, actorRol: null })
    expect(evento).toBeDefined()
    expect(evento.actorId).toBeNull()
  })

  it('un actorId uuid y un actorRol válido se guardan sin cambios', async () => {
    const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
    const { evento } = await eventoDeActor({ actorId: uuid, actorRol: 'admin' })
    expect(evento.actorId).toBe(uuid)
    expect(evento.actorRol).toBe('admin')
  })

  it('un actorRol fuera de las reglas se guarda como null', async () => {
    const { evento } = await eventoDeActor({ actorId: 'admin', actorRol: 'rol con espacios ?x' })
    expect(evento.actorId).toBe('admin')
    expect(evento.actorRol).toBeNull()
  })
})
