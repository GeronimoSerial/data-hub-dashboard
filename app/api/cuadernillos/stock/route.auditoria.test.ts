import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento, bookletCampaign, bookletMembership, bookletProduct, bookletStock, bookletStockMovement, user } from '@/lib/db/schema'
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

usarDbTemporal('cuadernillos-stock-auditoria-')

const sesion = (id: string) => ({ id, role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] })

async function sembrarPlanificador(id: string, conPlanificacion = true) {
  await getDb().insert(user).values({ id, name: id, email: `${id}@test.local`, emailVerified: true }).onConflictDoNothing()
  if (conPlanificacion) {
    await getDb().insert(bookletMembership).values({ id: randomUUID(), userId: id, capability: 'planning', grantedByUserId: id })
  }
}

async function sembrarCampana() {
  const campaignId = `camp-${randomUUID()}`
  const productId = `prod-${randomUUID()}`
  await getDb().insert(bookletCampaign).values({ id: campaignId, name: campaignId, status: 'active', distributionEnabled: true, overassignmentAllowed: false })
  await getDb().insert(bookletProduct).values({ id: productId, name: productId, levelCode: '1', gradeCode: '1' })
  return { campaignId, productId }
}

function postReq(body: unknown): Request {
  return new Request('http://localhost/api/cuadernillos/stock', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

async function stockDe(campaignId: string, productId: string) {
  const [fila] = await getDb().select().from(bookletStock).where(eq(bookletStock.productId, productId))
  return fila && fila.campaignId === campaignId ? fila.quantity : null
}

beforeEach(() => {
  sesionDePrueba.user = null
})

describe('auditoría de stock de cuadernillos', () => {
  it('cargar stock inicial deja un evento cuadernillo.stock_guardar del planificador', async () => {
    const planificador = `plan-${randomUUID()}`
    await sembrarPlanificador(planificador)
    const { campaignId, productId } = await sembrarCampana()
    sesionDePrueba.user = sesion(planificador)

    const res = await POST(postReq({ campaignId, productId, quantity: 5, movement: 'initial', idempotencyKey: 'clave-stock-1' }))
    expect(res.status).toBe(200)

    expect(await eventoDe(res)).toMatchObject({
      accion: 'cuadernillo.stock_guardar',
      metodo: 'POST',
      rutaPlantilla: '/api/cuadernillos/stock',
      actorTipo: 'usuario',
      actorId: planificador,
      objetoTipo: 'cuadernillo_stock',
      objetoId: productId,
      resultado: 'exito',
      httpStatus: 200,
      metadatos: { cantidad: 5 },
    })
    expect(await stockDe(campaignId, productId)).toBe(5)
  })

  it('sin permiso de planificación deja un evento rechazado y no carga stock', async () => {
    const sinPermiso = `sin-${randomUUID()}`
    await sembrarPlanificador(sinPermiso, false)
    const { campaignId, productId } = await sembrarCampana()
    sesionDePrueba.user = sesion(sinPermiso)

    const res = await POST(postReq({ campaignId, productId, quantity: 5, movement: 'initial', idempotencyKey: 'clave-stock-2' }))
    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ actorId: sinPermiso, resultado: 'rechazado', httpStatus: 403 })
    expect(await stockDe(campaignId, productId)).toBeNull()
  })

  it('cuerpo inválido deja un evento invalido', async () => {
    const planificador = `plan-${randomUUID()}`
    await sembrarPlanificador(planificador)
    sesionDePrueba.user = sesion(planificador)

    const res = await POST(postReq({ campaignId: 'x', productId: 'y', quantity: 0, movement: 'initial', idempotencyKey: 'k' }))
    expect(res.status).toBe(400)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'invalido', httpStatus: 400 })
  })

  it('si no se puede registrar la auditoría responde 503 y el stock no cambia', async () => {
    const planificador = `plan-${randomUUID()}`
    await sembrarPlanificador(planificador)
    const { campaignId, productId } = await sembrarCampana()
    sesionDePrueba.user = sesion(planificador)

    const res = await conFalloAuditoria(() => POST(postReq({ campaignId, productId, quantity: 5, movement: 'initial', idempotencyKey: 'clave-stock-3' })))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await stockDe(campaignId, productId)).toBeNull()
  })

  it('el evento no guarda la clave de idempotencia ni otros datos del cuerpo', async () => {
    const planificador = `plan-${randomUUID()}`
    await sembrarPlanificador(planificador)
    const { campaignId, productId } = await sembrarCampana()
    sesionDePrueba.user = sesion(planificador)

    await POST(postReq({ campaignId, productId, quantity: 5, movement: 'initial', idempotencyKey: 'clave-previa-stock' }))
    const res = await POST(postReq({ campaignId, productId, quantity: 7, movement: 'replenishment', idempotencyKey: 'clave-secreta-stock' }))
    expect(res.status).toBe(200)
    const evento = await eventoDe(res)
    expect(JSON.stringify(evento)).not.toContain('clave-secreta-stock')
    expect(evento.metadatos).toEqual({ cantidad: 7 })
  })

  it('repetir la misma carga de stock deja un evento repetido y no registra otro movimiento', async () => {
    const planificador = `plan-${randomUUID()}`
    await sembrarPlanificador(planificador)
    const { campaignId, productId } = await sembrarCampana()
    sesionDePrueba.user = sesion(planificador)
    const cuerpo = { campaignId, productId, quantity: 5, movement: 'initial', idempotencyKey: 'clave-repite-stock' }
    expect(await POST(postReq(cuerpo))).toMatchObject({ status: 200 })

    const res = await POST(postReq(cuerpo))
    expect(res.status).toBe(200)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'repetido', httpStatus: 200 })
    expect(await stockDe(campaignId, productId)).toBe(5)
    expect(await getDb().select().from(bookletStockMovement).where(eq(bookletStockMovement.productId, productId))).toHaveLength(1)
  })
})
