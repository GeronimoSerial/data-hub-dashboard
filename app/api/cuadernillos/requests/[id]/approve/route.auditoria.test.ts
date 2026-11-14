import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento, bookletQuota, bookletRequest, bookletRequestLine, bookletStock, bookletStockMovement, user } from '@/lib/db/schema'
import { POST } from './route'

vi.mock('@/lib/session', async () => {
  const { observarUsuarioAuditoria } = await import('@/lib/infraestructura/auditoria/contexto')
  return {
    getSessionUser: vi.fn(async () => {
      const actor = sesionDePrueba.user
      observarUsuarioAuditoria(actor)
      return actor
    }),
  }
})
vi.mock('@/lib/hub-entry-server', () => ({ hubApiAccessResponse: vi.fn(async () => null) }))

const sesionDePrueba: { user: { id: string; role: string; banned: boolean; nivelJurIds: string[]; accesoRecursos: string; recursoIds: string[] } | null } = { user: null }

usarDbTemporal('cuadernillos-retirada-requests-id-approve-auditoria-')

const productId = 'prod-retirada'
const sesion = (id: string) => ({ id, role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] })
const requestId = `sol-${randomUUID()}`

function postReq(id: string): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost/api/cuadernillos/requests/[id]/approve`.replace('[id]', id), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lines: [{ productId, quantity: 1 }], reason: 'x', idempotencyKey: 'k-retirada' }),
    }),
    { params: Promise.resolve({ id }) },
  ]
}

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

/** Row counts of every table the retired flow used to write. */
async function filasDeCuadernillos() {
  const db = getDb()
  return {
    solicitudes: (await db.select().from(bookletRequest)).length,
    lineas: (await db.select().from(bookletRequestLine)).length,
    cuotas: (await db.select().from(bookletQuota)).length,
    stock: (await db.select().from(bookletStock)).length,
    movimientos: (await db.select().from(bookletStockMovement)).length,
  }
}

async function sembrarAdmin() {
  const id = `admin-${randomUUID()}`
  await getDb().insert(user).values({ id, name: id, email: `${id}@test.local`, emailVerified: true }).onConflictDoNothing()
  return id
}

beforeEach(() => {
  sesionDePrueba.user = null
})

describe('auditoría de aprobación de solicitudes (flujo retirado)', () => {
  it('un POST autorizado responde 410 flow_retired, deja un evento cuadernillo.solicitud_aprobar con status 410 y no escribe cuadernillos', async () => {
    const adminId = await sembrarAdmin()
    sesionDePrueba.user = sesion(adminId)
    const antes = await filasDeCuadernillos()

    const res = await POST(...postReq(requestId))
    expect(res.status).toBe(410)
    expect(await res.json()).toMatchObject({ error: 'flow_retired' })

    expect(await eventoDe(res)).toMatchObject({
      accion: 'cuadernillo.solicitud_aprobar',
      metodo: 'POST',
      rutaPlantilla: '/api/cuadernillos/requests/[id]/approve',
      actorTipo: 'usuario',
      actorId: adminId,
      resultado: 'invalido',
      httpStatus: 410,
    })
    expect(await filasDeCuadernillos()).toEqual(antes)
  })

  it('si no se puede registrar la auditoría responde 503 y tampoco escribe cuadernillos', async () => {
    const adminId = await sembrarAdmin()
    sesionDePrueba.user = sesion(adminId)
    const antes = await filasDeCuadernillos()

    const res = await conFalloAuditoria(() => POST(...postReq(requestId)))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await filasDeCuadernillos()).toEqual(antes)
  })
})
