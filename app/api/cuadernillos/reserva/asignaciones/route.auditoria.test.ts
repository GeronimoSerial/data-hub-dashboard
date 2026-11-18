import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento, bookletCampaign, bookletMembership, bookletProduct, bookletRemito, bookletRemitoItem, bookletRemitoLine, bookletSchoolAssignment, bookletStockMovement, user } from '@/lib/db/schema'
import { POST } from './route'
import type * as Approvals from '@/lib/cuadernillos/approvals'
import type * as ParteMapa from '@/lib/infraestructura/parte-mapa'

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
// No GE part or confirmed-assignment hashes in the test: eligibility, authority and the GE schema are fixed here.
vi.mock('@/lib/cuadernillos/ge-conexion', () => ({ prepararEsquemaGe: vi.fn(async () => ({})) }))
vi.mock('@/lib/cuadernillos/approvals', async (importOriginal) => {
  const real = await importOriginal<typeof Approvals>()
  return {
    ...real,
    createApprovalRepository: (db: Parameters<typeof real.createApprovalRepository>[0]) => ({
      ...real.createApprovalRepository(db),
      lockEligibilitySources: async () => undefined,
      approvalAuthorityReady: async () => true,
    }),
  }
})
vi.mock('@/lib/infraestructura/parte-mapa', async (importOriginal) => ({
  ...(await importOriginal<typeof ParteMapa>()),
  listarPartesVigentes: vi.fn(async (filtro: { cueAnexo: string }) => ({ partes: [{ cueAnexo: filtro.cueAnexo, peorSeveridad: 'Crítica', nombre: 'Escuela de prueba' }] })),
}))

type Sesion = { id: string; role: string; banned: boolean; nivelJurIds: string[]; accesoRecursos: string; recursoIds: string[]; cueAnexo?: string | null }
const sesionDePrueba: { user: Sesion | null } = { user: null }

usarDbTemporal('cuadernillos-reserva-asignar-auditoria-')

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

async function sembrar(recibido = 100) {
  const cabeceraUser = `cab-${randomUUID()}`
  const planificador = `plan-${randomUUID()}`
  await sembrarUsuario(cabeceraUser)
  await sembrarUsuario(planificador)
  await getDb().insert(bookletMembership).values({ id: randomUUID(), userId: cabeceraUser, capability: 'cabecera', grantedByUserId: planificador })
  const campaignId = `camp-${randomUUID()}`
  const productId = `prod-${randomUUID()}`
  await getDb().insert(bookletCampaign).values({ id: campaignId, name: campaignId, status: 'active', distributionEnabled: true, overassignmentAllowed: false })
  await getDb().insert(bookletProduct).values({ id: productId, name: productId, levelCode: '1', gradeCode: '1' })
  const cabecera = cueAleatorio()
  await getDb().insert(bookletSchoolAssignment).values({
    cueAnexo: cabecera, schoolName: `Cabecera ${cabecera}`, relationship: 'cabecera', supervisorName: 'Supervisor',
    supervisorUserId: planificador, cabeceraCue: cabecera, cabeceraUserId: cabeceraUser,
    provenance: [{ sourceId: 'fuente', location: 'fila 1' }], confirmedByUserId: planificador, confirmedAt: new Date(),
  })
  // The reserve Planeamiento dispatched and the cabecera already signed for.
  const remitoId = randomUUID(), lineId = randomUUID()
  await getDb().insert(bookletRemito).values({
    id: remitoId, campaignId, modo: 'cabecera', cabeceraCueAnexo: cabecera, status: 'received', dispatchedByUserId: planificador,
    dispatchedAt: new Date(), cabeceraReceivedByUserId: cabeceraUser, cabeceraReceivedAt: new Date(),
  })
  await getDb().insert(bookletRemitoLine).values({ id: lineId, remitoId, recipientCueAnexo: cabecera, status: 'at_cabecera', reserva: true })
  await getDb().insert(bookletRemitoItem).values({ lineId, productId, dispatchedQuantity: recibido, cabeceraReceivedQuantity: recibido })
  return { cabeceraUser, planificador, campaignId, productId, cabecera, escuela: cueAleatorio() }
}

const cuerpo = (s: Awaited<ReturnType<typeof sembrar>>, idempotencyKey: string, quantity = 20) => ({
  campaignId: s.campaignId, recipientCueAnexo: s.escuela, idempotencyKey, items: [{ productId: s.productId, quantity }],
})
const postReq = (body: unknown) => new Request('http://localhost/api/cuadernillos/reserva/asignaciones', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})
async function estado(s: Awaited<ReturnType<typeof sembrar>>) {
  const origen = await getDb().select().from(bookletRemito).where(eq(bookletRemito.origenCabeceraCueAnexo, s.cabecera))
  const movimientos = await getDb().select().from(bookletStockMovement).where(eq(bookletStockMovement.productId, s.productId))
  return { remitosOnward: origen.length, movimientos: movimientos.length }
}

describe('auditoría de la asignación desde la reserva', () => {
  it('asignar deja un evento de despacho de remito con la cantidad y sin movimiento de stock', async () => {
    const s = await sembrar()
    sesionDePrueba.user = sesion(s.cabeceraUser)
    const res = await POST(postReq(cuerpo(s, 'k-asigna-1')))
    expect(res.status).toBe(201)
    const creado = await res.json() as { remitoId: string }
    expect(await eventoDe(res)).toMatchObject({
      accion: 'cuadernillo.remito_despachar', metodo: 'POST', rutaPlantilla: '/api/cuadernillos/reserva/asignaciones',
      actorId: s.cabeceraUser, objetoTipo: 'cuadernillo_remito', objetoId: creado.remitoId, cueAnexo: s.escuela,
      resultado: 'exito', httpStatus: 201, metadatos: { cantidad: 20 },
    })
    expect(await estado(s)).toEqual({ remitosOnward: 1, movimientos: 0 })
  })

  it('si no se puede registrar la auditoría responde 503 y no queda remito', async () => {
    const s = await sembrar()
    sesionDePrueba.user = sesion(s.cabeceraUser)
    const res = await conFalloAuditoria(() => POST(postReq(cuerpo(s, 'k-asigna-2'))))
    expect(res.status).toBe(503)
    expect(await estado(s)).toEqual({ remitosOnward: 0, movimientos: 0 })
  })

  it('repetir la misma asignación deja un evento repetido y no vuelve a asignar', async () => {
    const s = await sembrar()
    sesionDePrueba.user = sesion(s.cabeceraUser)
    const body = cuerpo(s, 'k-asigna-repite')
    const first = await POST(postReq(body))
    const res = await POST(postReq(body))
    expect(res.status).toBe(201)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'repetido', httpStatus: 201 })
    expect(await res.json()).toEqual(await first.json())
    expect(await estado(s)).toEqual({ remitosOnward: 1, movimientos: 0 })
  })

  it('el supervisor y quien no es la cabecera quedan rechazados, y pasarse de la reserva responde 409', async () => {
    const s = await sembrar()
    sesionDePrueba.user = sesion(s.planificador)
    const supervisor = await POST(postReq(cuerpo(s, 'k-asigna-3')))
    expect(supervisor.status).toBe(403)
    expect(await eventoDe(supervisor)).toMatchObject({ actorId: s.planificador, resultado: 'rechazado', httpStatus: 403 })

    sesionDePrueba.user = sesion(s.cabeceraUser)
    const exceso = await POST(postReq(cuerpo(s, 'k-asigna-4', 101)))
    expect(exceso.status).toBe(409)
    expect(await exceso.json()).toMatchObject({ error: 'insufficient_reserve', productIds: [s.productId] })
    expect(await estado(s)).toEqual({ remitosOnward: 0, movimientos: 0 })
  })
})
