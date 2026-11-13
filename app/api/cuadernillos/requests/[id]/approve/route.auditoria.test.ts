import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import {
  auditoriaEvento, bookletCampaign, bookletProduct, bookletQuota, bookletRequest, bookletRequestLine, bookletSchoolAssignment, bookletStock, user,
} from '@/lib/db/schema'
import { POST } from './route'
import type * as GeDb from '@/lib/infraestructura/ge-db'
import type * as Elegibilidad from '@/lib/cuadernillos/eligibility'

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
// Sin parte GE en el test: la elegibilidad Crítica se fija aquí, no se consulta.
vi.mock('@/lib/cuadernillos/eligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof Elegibilidad>()),
  getSchoolEligibility: vi.fn(async () => ({ eligible: true, severity: 'Crítica', evaluatedAt: new Date().toISOString() })),
  lockCurrentEligibilitySources: vi.fn(async () => undefined),
}))

// Guardia: registra cualquier consulta por el cliente crudo que corra con la auditoría abierta.
const guardia = vi.hoisted(() => ({ violaciones: [] as string[] }))
vi.mock('@/lib/infraestructura/ge-db', async (importOriginal) => {
  const real = await importOriginal<typeof GeDb>()
  const { getRawClient } = await import('@/lib/db')
  const { transaccionContextual } = await import('@/lib/db/contexto')
  return {
    ...real,
    crearEjecutorSql: (raw: Parameters<typeof real.crearEjecutorSql>[0]) => {
      const ejecutor = real.crearEjecutorSql(raw)
      const original = ejecutor.execute
      ejecutor.execute = (query) => {
        if (raw === getRawClient() && transaccionContextual.getStore()) {
          guardia.violaciones.push(typeof query === 'string' ? query : query.sql)
        }
        return original(query)
      }
      return ejecutor
    },
  }
})

const sesionDePrueba: { user: { id: string; role: string; banned: boolean; nivelJurIds: string[]; accesoRecursos: string; recursoIds: string[] } | null } = { user: null }

usarDbTemporal('cuadernillos-approve-auditoria-')

const sesion = (id: string, role = 'admin') => ({ id, role, banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] })
const cueAleatorio = () => String(100_000_000 + Math.floor(Math.random() * 899_999_999))

async function sembrarAdmin(id: string) {
  await getDb().insert(user).values({ id, name: id, email: `${id}@test.local`, emailVerified: true }).onConflictDoNothing()
}

async function sembrarSolicitudPendiente() {
  const adminId = `admin-${randomUUID()}`
  await sembrarAdmin(adminId)
  const cue = cueAleatorio()
  await getDb().insert(bookletSchoolAssignment).values({
    cueAnexo: cue, schoolName: `Cabecera ${cue}`, relationship: 'cabecera', supervisorName: 'Supervisor',
    supervisorUserId: adminId, cabeceraCue: cue, cabeceraUserId: adminId,
    provenance: [{ sourceId: 'fuente', location: 'fila 1' }], confirmedByUserId: adminId, confirmedAt: new Date(),
  })
  const campaignId = `camp-${randomUUID()}`
  const productId = `prod-${randomUUID()}`
  const requestId = `sol-${randomUUID()}`
  await getDb().insert(bookletCampaign).values({ id: campaignId, name: campaignId, status: 'active', distributionEnabled: true, overassignmentAllowed: false })
  await getDb().insert(bookletProduct).values({ id: productId, name: productId, levelCode: '1', gradeCode: '1' })
  await getDb().insert(bookletStock).values({ campaignId, productId, quantity: 10 })
  await getDb().insert(bookletQuota).values({ campaignId, cabeceraCueAnexo: cue, productId, quantity: 5, updatedByUserId: adminId })
  await getDb().insert(bookletRequest).values({
    id: requestId, campaignId, recipientCueAnexo: cueAleatorio(), cabeceraCueAnexo: cue, rootRequestId: requestId,
    status: 'pending', createdByUserId: adminId, submittedAt: new Date(),
  })
  await getDb().insert(bookletRequestLine).values({ requestId, productId, quantity: 2 })
  return { adminId, campaignId, productId, requestId, cue }
}

function postReq(id: string, body: unknown): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost/api/cuadernillos/requests/${id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
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

async function estadoDe(requestId: string) {
  const [fila] = await getDb().select({ status: bookletRequest.status }).from(bookletRequest).where(eq(bookletRequest.id, requestId))
  return fila?.status
}

beforeEach(() => {
  sesionDePrueba.user = null
})

describe('auditoría de aprobación de solicitudes', () => {
  it('ninguna lectura cruda corre con la auditoría abierta', async () => {
    const { adminId, productId, requestId } = await sembrarSolicitudPendiente()
    sesionDePrueba.user = sesion(adminId)
    guardia.violaciones.length = 0

    const res = await POST(...postReq(requestId, { lines: [{ productId, quantity: 1 }], idempotencyKey: 'k-aprueba-guardia' }))
    expect(res.status).toBe(200)
    expect(guardia.violaciones).toEqual([])
  })

  it('aprobar una solicitud deja un evento cuadernillo.solicitud_aprobar con su cantidad', async () => {
    const { adminId, campaignId, productId, requestId } = await sembrarSolicitudPendiente()
    sesionDePrueba.user = sesion(adminId)

    const res = await POST(...postReq(requestId, { lines: [{ productId, quantity: 2 }], idempotencyKey: 'k-aprueba-1' }))
    expect(res.status).toBe(200)

    expect(await eventoDe(res)).toMatchObject({
      accion: 'cuadernillo.solicitud_aprobar',
      metodo: 'POST',
      rutaPlantilla: '/api/cuadernillos/requests/[id]/approve',
      actorTipo: 'usuario',
      actorId: adminId,
      objetoTipo: 'cuadernillo_solicitud',
      objetoId: requestId,
      resultado: 'exito',
      httpStatus: 200,
      metadatos: { cantidad: 2 },
    })
    expect(await estadoDe(requestId)).toBe('approved')
    const [stock] = await getDb().select().from(bookletStock).where(and(eq(bookletStock.campaignId, campaignId), eq(bookletStock.productId, productId)))
    expect(stock?.quantity).toBe(8)
  })

  it('aprobar una solicitud inexistente deja un evento invalido', async () => {
    const adminId = `admin-${randomUUID()}`
    await sembrarAdmin(adminId)
    sesionDePrueba.user = sesion(adminId)

    const res = await POST(...postReq(`no-existe-${randomUUID()}`, { lines: [{ productId: 'x', quantity: 1 }], idempotencyKey: 'k-aprueba-2' }))
    expect(res.status).toBe(404)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'invalido', httpStatus: 404 })
  })

  it('si no se puede registrar la auditoría responde 503 y la solicitud queda pendiente con stock intacto', async () => {
    const { adminId, campaignId, productId, requestId } = await sembrarSolicitudPendiente()
    sesionDePrueba.user = sesion(adminId)

    const res = await conFalloAuditoria(() => POST(...postReq(requestId, { lines: [{ productId, quantity: 2 }], idempotencyKey: 'k-aprueba-3' })))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await estadoDe(requestId)).toBe('pending')
    const [stock] = await getDb().select().from(bookletStock).where(and(eq(bookletStock.campaignId, campaignId), eq(bookletStock.productId, productId)))
    expect(stock?.quantity).toBe(10)
  })

  it('repetir la misma aprobación deja un evento repetido y no vuelve a descontar', async () => {
    const { adminId, campaignId, productId, requestId } = await sembrarSolicitudPendiente()
    sesionDePrueba.user = sesion(adminId)
    const cuerpo = { lines: [{ productId, quantity: 2 }], idempotencyKey: 'k-aprueba-repite' }
    expect(await POST(...postReq(requestId, cuerpo))).toMatchObject({ status: 200 })

    const res = await POST(...postReq(requestId, cuerpo))
    expect(res.status).toBe(200)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'repetido', httpStatus: 200 })
    const [stock] = await getDb().select().from(bookletStock).where(and(eq(bookletStock.campaignId, campaignId), eq(bookletStock.productId, productId)))
    expect(stock?.quantity).toBe(8)
  })
})
