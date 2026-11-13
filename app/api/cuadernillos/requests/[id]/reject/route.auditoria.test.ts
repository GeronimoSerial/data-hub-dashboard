import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import {
  auditoriaEvento, bookletCampaign, bookletProduct, bookletRequest, bookletRequestLine, bookletSchoolAssignment, user,
} from '@/lib/db/schema'
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

usarDbTemporal('cuadernillos-reject-auditoria-')

const sesion = (id: string) => ({ id, role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] })
const cueAleatorio = () => String(100_000_000 + Math.floor(Math.random() * 899_999_999))

async function sembrarSolicitud(status: 'pending' | 'approved' = 'pending') {
  const adminId = `admin-${randomUUID()}`
  await getDb().insert(user).values({ id: adminId, name: adminId, email: `${adminId}@test.local`, emailVerified: true })
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
  await getDb().insert(bookletRequest).values({
    id: requestId, campaignId, recipientCueAnexo: cueAleatorio(), cabeceraCueAnexo: cue, rootRequestId: requestId,
    status, createdByUserId: adminId, submittedAt: new Date(),
    ...(status === 'approved' ? { approvedByUserId: adminId, approvedAt: new Date() } : {}),
  })
  await getDb().insert(bookletRequestLine).values({ requestId, productId, quantity: 2, approvedQuantity: status === 'approved' ? 2 : 0 })
  return { adminId, requestId }
}

function postReq(id: string, body: unknown): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost/api/cuadernillos/requests/${id}/reject`, {
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

describe('auditoría de rechazo de solicitudes', () => {
  it('rechazar una solicitud pendiente deja un evento cuadernillo.solicitud_rechazar', async () => {
    const { adminId, requestId } = await sembrarSolicitud()
    sesionDePrueba.user = sesion(adminId)

    const res = await POST(...postReq(requestId, { reason: 'Motivo de prueba', idempotencyKey: 'k-rechaza-1' }))
    expect(res.status).toBe(200)

    expect(await eventoDe(res)).toMatchObject({
      accion: 'cuadernillo.solicitud_rechazar',
      metodo: 'POST',
      rutaPlantilla: '/api/cuadernillos/requests/[id]/reject',
      actorTipo: 'usuario',
      actorId: adminId,
      objetoTipo: 'cuadernillo_solicitud',
      objetoId: requestId,
      resultado: 'exito',
      httpStatus: 200,
    })
    expect(await estadoDe(requestId)).toBe('rejected')
  })

  it('rechazar una solicitud ya aprobada deja un evento conflicto y no la cambia', async () => {
    const { adminId, requestId } = await sembrarSolicitud('approved')
    sesionDePrueba.user = sesion(adminId)

    const res = await POST(...postReq(requestId, { reason: 'Tarde', idempotencyKey: 'k-rechaza-2' }))
    expect(res.status).toBe(409)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'conflicto', httpStatus: 409 })
    expect(await estadoDe(requestId)).toBe('approved')
  })

  it('si no se puede registrar la auditoría responde 503 y la solicitud sigue pendiente', async () => {
    const { adminId, requestId } = await sembrarSolicitud()
    sesionDePrueba.user = sesion(adminId)

    const res = await conFalloAuditoria(() => POST(...postReq(requestId, { reason: 'Motivo de prueba', idempotencyKey: 'k-rechaza-3' })))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await estadoDe(requestId)).toBe('pending')
  })

  it('el motivo del rechazo no entra en el evento', async () => {
    const { adminId, requestId } = await sembrarSolicitud()
    sesionDePrueba.user = sesion(adminId)

    const res = await POST(...postReq(requestId, { reason: 'texto-confidencial-del-motivo', idempotencyKey: 'k-rechaza-4' }))
    expect(res.status).toBe(200)
    expect(JSON.stringify(await eventoDe(res))).not.toContain('texto-confidencial-del-motivo')
  })
})
