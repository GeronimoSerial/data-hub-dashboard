import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento, bookletCampaign, bookletMembership, bookletRemito, bookletRemitoObservation, bookletSchoolAssignment, user } from '@/lib/db/schema'
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

type Sesion = { id: string; role: string; banned: boolean; nivelJurIds: string[]; accesoRecursos: string; recursoIds: string[]; cueAnexo?: string | null }
const sesionDePrueba: { user: Sesion | null } = { user: null }

usarDbTemporal('cuadernillos-remito-observacion-auditoria-')

const sesion = (id: string, role = 'consulta', cueAnexo: string | null = null): Sesion => ({ id, role, banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [], cueAnexo })
const cueAleatorio = () => String(100_000_000 + Math.floor(Math.random() * 899_999_999))

async function sembrarUsuario(id: string) {
  await getDb().insert(user).values({ id, name: id, email: `${id}@test.local`, emailVerified: true }).onConflictDoNothing()
}

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

beforeEach(() => {
  sesionDePrueba.user = null
})

async function sembrar() {
  const supervisor = `sup-${randomUUID()}`
  await sembrarUsuario(supervisor)
  await getDb().insert(bookletMembership).values({ id: randomUUID(), userId: supervisor, capability: 'supervisor', grantedByUserId: supervisor })
  const cabecera = cueAleatorio()
  await getDb().insert(bookletSchoolAssignment).values({
    cueAnexo: cabecera, schoolName: `Cabecera ${cabecera}`, relationship: 'cabecera', supervisorName: 'Supervisor',
    supervisorUserId: supervisor, cabeceraCue: cabecera, cabeceraUserId: supervisor,
    provenance: [{ sourceId: 'fuente', location: 'fila 1' }], confirmedByUserId: supervisor, confirmedAt: new Date(),
  })
  const campaignId = `camp-${randomUUID()}`
  await getDb().insert(bookletCampaign).values({ id: campaignId, name: campaignId, status: 'active', distributionEnabled: true, overassignmentAllowed: false })
  const remitoId = `rem-${randomUUID()}`
  await getDb().insert(bookletRemito).values({ id: remitoId, campaignId, cabeceraCueAnexo: cabecera, status: 'dispatched', dispatchedByUserId: supervisor, dispatchedAt: new Date() })
  return { supervisor, remitoId }
}

function postReq(id: string, body: unknown): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost/api/cuadernillos/remitos/${id}/observaciones`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  ]
}

const observaciones = async (remitoId: string) =>
  (await getDb().select().from(bookletRemitoObservation).where(eq(bookletRemitoObservation.remitoId, remitoId))).length

describe('auditoría de observaciones sobre remitos', () => {
  it('observar deja un evento cuadernillo.remito_observar sin guardar el texto', async () => {
    const s = await sembrar()
    sesionDePrueba.user = sesion(s.supervisor)

    const res = await POST(...postReq(s.remitoId, { body: 'texto-privado-de-la-observacion' }))
    expect(res.status).toBe(201)

    const evento = await eventoDe(res)
    expect(evento).toMatchObject({
      accion: 'cuadernillo.remito_observar',
      metodo: 'POST',
      rutaPlantilla: '/api/cuadernillos/remitos/[id]/observaciones',
      actorTipo: 'usuario',
      actorId: s.supervisor,
      objetoTipo: 'cuadernillo_remito',
      objetoId: s.remitoId,
      resultado: 'exito',
      httpStatus: 201,
    })
    expect(JSON.stringify(evento)).not.toContain('texto-privado-de-la-observacion')
    expect(await observaciones(s.remitoId)).toBe(1)
  })

  it('si no se puede registrar la auditoría responde 503 y no queda la observación', async () => {
    const s = await sembrar()
    sesionDePrueba.user = sesion(s.supervisor)

    const res = await conFalloAuditoria(() => POST(...postReq(s.remitoId, { body: 'nota' })))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await observaciones(s.remitoId)).toBe(0)
  })

  it('otro usuario no puede observar: evento rechazado y sin observación', async () => {
    const s = await sembrar()
    const intruso = `otro-${randomUUID()}`
    await sembrarUsuario(intruso)
    sesionDePrueba.user = sesion(intruso)

    const res = await POST(...postReq(s.remitoId, { body: 'nota' }))
    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ actorId: intruso, resultado: 'rechazado', httpStatus: 403 })
    expect(await observaciones(s.remitoId)).toBe(0)
  })
})
