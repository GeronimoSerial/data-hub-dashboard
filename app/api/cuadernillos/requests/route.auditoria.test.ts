import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import {
  auditoriaEvento, bookletCampaign, bookletMembership, bookletProduct, bookletQuota, bookletRequest, bookletSchoolAssignment, user,
} from '@/lib/db/schema'
import { POST } from './route'
import type * as Elegibilidad from '@/lib/cuadernillos/eligibility'
import type * as GeDb from '@/lib/infraestructura/ge-db'

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
// La elegibilidad lee el parte vigente; el test fija solo la decisión, no la fuente.
vi.mock('@/lib/cuadernillos/eligibility', async (importOriginal) => ({
  ...(await importOriginal<typeof Elegibilidad>()),
  getSchoolEligibilityWithName: vi.fn(async () => ({ eligible: true, severity: 'Crítica', evaluatedAt: new Date().toISOString(), nombre: 'Escuela destino' })),
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

usarDbTemporal('cuadernillos-requests-auditoria-')

const sesion = (id: string) => ({ id, role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [] })
const cueAleatorio = () => String(100_000_000 + Math.floor(Math.random() * 899_999_999))

async function sembrarCabecera(id: string) {
  await getDb().insert(user).values({ id, name: id, email: `${id}@test.local`, emailVerified: true }).onConflictDoNothing()
  await getDb().insert(bookletMembership).values({ id: randomUUID(), userId: id, capability: 'cabecera', grantedByUserId: id })
  const cue = cueAleatorio()
  await getDb().insert(bookletSchoolAssignment).values({
    cueAnexo: cue, schoolName: `Cabecera ${cue}`, relationship: 'cabecera', supervisorName: 'Supervisor',
    supervisorUserId: id, cabeceraCue: cue, cabeceraUserId: id,
    provenance: [{ sourceId: 'fuente', location: 'fila 1' }], confirmedByUserId: id, confirmedAt: new Date(),
  })
  return cue
}

async function sembrarCampanaConCuota(cabeceraCue: string, cabeceraId: string, cuota: number) {
  const campaignId = `camp-${randomUUID()}`
  const productId = `prod-${randomUUID()}`
  await getDb().insert(bookletCampaign).values({ id: campaignId, name: campaignId, status: 'active', distributionEnabled: true, overassignmentAllowed: false })
  await getDb().insert(bookletProduct).values({ id: productId, name: productId, levelCode: '1', gradeCode: '1' })
  await getDb().insert(bookletQuota).values({ campaignId, cabeceraCueAnexo: cabeceraCue, productId, quantity: cuota, updatedByUserId: cabeceraId })
  return { campaignId, productId }
}

function postReq(body: unknown): Request {
  return new Request('http://localhost/api/cuadernillos/requests', {
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

async function solicitudesDe(campaignId: string) {
  return getDb().select().from(bookletRequest).where(eq(bookletRequest.campaignId, campaignId))
}

beforeEach(() => {
  sesionDePrueba.user = null
})

describe('auditoría de solicitudes de cuadernillos', () => {
  it('ninguna lectura cruda corre con la auditoría abierta', async () => {
    const cabeceraId = `cab-${randomUUID()}`
    const cue = await sembrarCabecera(cabeceraId)
    const { campaignId, productId } = await sembrarCampanaConCuota(cue, cabeceraId, 5)
    sesionDePrueba.user = sesion(cabeceraId)
    guardia.violaciones.length = 0

    const res = await POST(postReq({ campaignId, recipientCueAnexo: cueAleatorio(), cabeceraCueAnexo: cue, lines: [{ productId, quantity: 1 }], submit: true, idempotencyKey: 'k-solicitud-guardia' }))
    expect(res.status).toBe(201)
    expect(guardia.violaciones).toEqual([])
  })

  it('crear una solicitud deja un evento cuadernillo.solicitud_crear de la cabecera', async () => {
    const cabeceraId = `cab-${randomUUID()}`
    const cue = await sembrarCabecera(cabeceraId)
    const { campaignId, productId } = await sembrarCampanaConCuota(cue, cabeceraId, 5)
    const destino = cueAleatorio()
    sesionDePrueba.user = sesion(cabeceraId)

    const res = await POST(postReq({ campaignId, recipientCueAnexo: destino, cabeceraCueAnexo: cue, lines: [{ productId, quantity: 2 }], submit: true, idempotencyKey: 'k-solicitud-1' }))
    expect(res.status).toBe(201)
    const { request: creada } = await res.clone().json() as { request: { requestId: string } }

    expect(await eventoDe(res)).toMatchObject({
      accion: 'cuadernillo.solicitud_crear',
      metodo: 'POST',
      rutaPlantilla: '/api/cuadernillos/requests',
      actorTipo: 'usuario',
      actorId: cabeceraId,
      objetoTipo: 'cuadernillo_solicitud',
      objetoId: creada.requestId,
      cueAnexo: destino,
      resultado: 'exito',
      httpStatus: 201,
      metadatos: { cantidad: 2 },
    })
    expect(await solicitudesDe(campaignId)).toHaveLength(1)
  })

  it('pedir más que la cuota deja un evento conflicto y no crea la solicitud', async () => {
    const cabeceraId = `cab-${randomUUID()}`
    const cue = await sembrarCabecera(cabeceraId)
    const { campaignId, productId } = await sembrarCampanaConCuota(cue, cabeceraId, 1)
    sesionDePrueba.user = sesion(cabeceraId)

    const res = await POST(postReq({ campaignId, recipientCueAnexo: cueAleatorio(), cabeceraCueAnexo: cue, lines: [{ productId, quantity: 4 }], submit: true, idempotencyKey: 'k-solicitud-2' }))
    expect(res.status).toBe(409)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'conflicto', httpStatus: 409 })
    expect(await solicitudesDe(campaignId)).toHaveLength(0)
  })

  it('si no se puede registrar la auditoría responde 503 y la solicitud no se guarda', async () => {
    const cabeceraId = `cab-${randomUUID()}`
    const cue = await sembrarCabecera(cabeceraId)
    const { campaignId, productId } = await sembrarCampanaConCuota(cue, cabeceraId, 5)
    sesionDePrueba.user = sesion(cabeceraId)

    const res = await conFalloAuditoria(() => POST(postReq({ campaignId, recipientCueAnexo: cueAleatorio(), cabeceraCueAnexo: cue, lines: [{ productId, quantity: 2 }], submit: true, idempotencyKey: 'k-solicitud-3' })))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await solicitudesDe(campaignId)).toHaveLength(0)
  })

  it('repetir la misma solicitud deja un evento repetido y no crea otra', async () => {
    const cabeceraId = `cab-${randomUUID()}`
    const cue = await sembrarCabecera(cabeceraId)
    const { campaignId, productId } = await sembrarCampanaConCuota(cue, cabeceraId, 5)
    sesionDePrueba.user = sesion(cabeceraId)
    const cuerpo = { campaignId, recipientCueAnexo: cueAleatorio(), cabeceraCueAnexo: cue, lines: [{ productId, quantity: 2 }], submit: true, idempotencyKey: 'k-solicitud-repite' }
    expect(await POST(postReq(cuerpo))).toMatchObject({ status: 201 })

    const res = await POST(postReq(cuerpo))
    expect(res.status).toBe(201)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'repetido', httpStatus: 201 })
    expect(await solicitudesDe(campaignId)).toHaveLength(1)
  })
})
