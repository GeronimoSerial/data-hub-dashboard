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

usarDbTemporal('cuadernillos-remainder-auditoria-')

const sesion = (id: string) => ({ id, role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] })
const cueAleatorio = () => String(100_000_000 + Math.floor(Math.random() * 899_999_999))

async function sembrarRaiz(status: 'approved' | 'pending') {
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
  await getDb().insert(bookletRequestLine).values({ requestId, productId, quantity: 3, approvedQuantity: status === 'approved' ? 2 : 0 })
  return { adminId, requestId, campaignId, productId }
}

function postReq(id: string, body: unknown): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost/api/cuadernillos/requests/${id}/remainder`, {
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

async function solicitudesDeCampana(campaignId: string) {
  return getDb().select({ id: bookletRequest.id }).from(bookletRequest).where(eq(bookletRequest.campaignId, campaignId))
}

beforeEach(() => {
  sesionDePrueba.user = null
})

describe('auditoría de saldos de solicitudes', () => {
  it('ninguna lectura cruda corre con la auditoría abierta', async () => {
    const { adminId, requestId, productId } = await sembrarRaiz('approved')
    sesionDePrueba.user = sesion(adminId)
    guardia.violaciones.length = 0

    const res = await POST(...postReq(requestId, { lines: [{ productId, quantity: 1 }], idempotencyKey: 'k-remanente-guardia' }))
    expect(res.status).toBe(201)
    expect(guardia.violaciones).toEqual([])
  })

  it('pedir el remanente deja un evento cuadernillo.solicitud_remanente', async () => {
    const { adminId, requestId, campaignId, productId } = await sembrarRaiz('approved')
    sesionDePrueba.user = sesion(adminId)

    const res = await POST(...postReq(requestId, { lines: [{ productId, quantity: 1 }], idempotencyKey: 'k-remanente-1' }))
    expect(res.status).toBe(201)

    expect(await eventoDe(res)).toMatchObject({
      accion: 'cuadernillo.solicitud_remanente',
      metodo: 'POST',
      rutaPlantilla: '/api/cuadernillos/requests/[id]/remainder',
      actorTipo: 'usuario',
      actorId: adminId,
      objetoTipo: 'cuadernillo_solicitud',
      resultado: 'exito',
      httpStatus: 201,
      metadatos: { cantidad: 1 },
    })
    expect(await solicitudesDeCampana(campaignId)).toHaveLength(2)
  })

  it('pedir remanente de una solicitud no aprobada deja un evento conflicto', async () => {
    const { adminId, requestId, productId, campaignId } = await sembrarRaiz('pending')
    sesionDePrueba.user = sesion(adminId)

    const res = await POST(...postReq(requestId, { lines: [{ productId, quantity: 1 }], idempotencyKey: 'k-remanente-2' }))
    expect(res.status).toBe(409)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'conflicto', httpStatus: 409 })
    expect(await solicitudesDeCampana(campaignId)).toHaveLength(1)
  })

  it('si no se puede registrar la auditoría responde 503 y no se crea el remanente', async () => {
    const { adminId, requestId, productId, campaignId } = await sembrarRaiz('approved')
    sesionDePrueba.user = sesion(adminId)

    const res = await conFalloAuditoria(() => POST(...postReq(requestId, { lines: [{ productId, quantity: 1 }], idempotencyKey: 'k-remanente-3' })))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await solicitudesDeCampana(campaignId)).toHaveLength(1)
  })

  it('repetir el mismo remanente deja un evento repetido y no crea otra solicitud', async () => {
    const { adminId, requestId, campaignId, productId } = await sembrarRaiz('approved')
    sesionDePrueba.user = sesion(adminId)
    const cuerpo = { lines: [{ productId, quantity: 1 }], idempotencyKey: 'k-remanente-repite' }
    expect(await POST(...postReq(requestId, cuerpo))).toMatchObject({ status: 201 })

    const res = await POST(...postReq(requestId, cuerpo))
    expect(res.status).toBe(201)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'repetido', httpStatus: 201 })
    expect(await solicitudesDeCampana(campaignId)).toHaveLength(2)
  })
})
