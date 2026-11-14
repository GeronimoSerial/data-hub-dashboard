import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import {
  auditoriaEvento, bookletCampaign, bookletMembership, bookletProduct, bookletQuota, bookletSchoolAssignment, bookletStock, user,
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

usarDbTemporal('cuadernillos-quotas-auditoria-')

const sesion = (id: string) => ({ id, role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] })
const cueAleatorio = () => String(100_000_000 + Math.floor(Math.random() * 899_999_999))

async function sembrarPlanificador(id: string) {
  await getDb().insert(user).values({ id, name: id, email: `${id}@test.local`, emailVerified: true }).onConflictDoNothing()
  await getDb().insert(bookletMembership).values({ id: randomUUID(), userId: id, capability: 'planning', grantedByUserId: id })
}

async function sembrarCabecera(planificador: string) {
  const cue = cueAleatorio()
  await getDb().insert(bookletSchoolAssignment).values({
    cueAnexo: cue, schoolName: `Escuela ${cue}`, relationship: 'cabecera', supervisorName: 'Supervisor',
    supervisorUserId: planificador, cabeceraCue: cue, cabeceraUserId: planificador,
    provenance: [{ sourceId: 'fuente', location: 'fila 1' }], confirmedByUserId: planificador, confirmedAt: new Date(),
  })
  return cue
}

async function sembrarCampanaConStock(stock: number) {
  const campaignId = `camp-${randomUUID()}`
  const productId = `prod-${randomUUID()}`
  await getDb().insert(bookletCampaign).values({ id: campaignId, name: campaignId, status: 'active', distributionEnabled: true, overassignmentAllowed: false })
  await getDb().insert(bookletProduct).values({ id: productId, name: productId, levelCode: '1', gradeCode: '1' })
  await getDb().insert(bookletStock).values({ campaignId, productId, quantity: stock })
  return { campaignId, productId }
}

function postReq(body: unknown): Request {
  return new Request('http://localhost/api/cuadernillos/quotas', {
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

async function cuotaDe(campaignId: string, cabeceraCue: string, productId: string) {
  const [fila] = await getDb().select().from(bookletQuota)
    .where(and(eq(bookletQuota.campaignId, campaignId), eq(bookletQuota.cabeceraCueAnexo, cabeceraCue), eq(bookletQuota.productId, productId)))
  return fila?.quantity ?? null
}

beforeEach(() => {
  sesionDePrueba.user = null
})

describe('auditoría de cuotas de cuadernillos', () => {
  it('asignar una cuota deja un evento cuadernillo.cuota_guardar del planificador', async () => {
    const planificador = `plan-${randomUUID()}`
    await sembrarPlanificador(planificador)
    const cue = await sembrarCabecera(planificador)
    const { campaignId, productId } = await sembrarCampanaConStock(10)
    sesionDePrueba.user = sesion(planificador)

    const res = await POST(postReq({ campaignId, cabeceraCueAnexo: cue, productId, quantity: 3 }))
    expect(res.status).toBe(200)

    expect(await eventoDe(res)).toMatchObject({
      accion: 'cuadernillo.cuota_guardar',
      metodo: 'POST',
      rutaPlantilla: '/api/cuadernillos/quotas',
      actorTipo: 'usuario',
      actorId: planificador,
      objetoTipo: 'cuadernillo_cuota',
      objetoId: productId,
      cueAnexo: cue,
      resultado: 'exito',
      httpStatus: 200,
      metadatos: { cantidad: 3 },
    })
    expect(await cuotaDe(campaignId, cue, productId)).toBe(3)
  })

  it('una cuota que supera el stock deja un evento conflicto y no escribe la cuota', async () => {
    const planificador = `plan-${randomUUID()}`
    await sembrarPlanificador(planificador)
    const cue = await sembrarCabecera(planificador)
    const { campaignId, productId } = await sembrarCampanaConStock(2)
    sesionDePrueba.user = sesion(planificador)

    const res = await POST(postReq({ campaignId, cabeceraCueAnexo: cue, productId, quantity: 3 }))
    expect(res.status).toBe(409)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'conflicto', httpStatus: 409 })
    expect(await cuotaDe(campaignId, cue, productId)).toBeNull()
  })

  it('si no se puede registrar la auditoría responde 503 y la cuota no se escribe', async () => {
    const planificador = `plan-${randomUUID()}`
    await sembrarPlanificador(planificador)
    const cue = await sembrarCabecera(planificador)
    const { campaignId, productId } = await sembrarCampanaConStock(10)
    sesionDePrueba.user = sesion(planificador)

    const res = await conFalloAuditoria(() => POST(postReq({ campaignId, cabeceraCueAnexo: cue, productId, quantity: 3 })))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await cuotaDe(campaignId, cue, productId)).toBeNull()
  })
})
