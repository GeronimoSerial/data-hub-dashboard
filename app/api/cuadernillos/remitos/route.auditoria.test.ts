import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento, bookletCampaign, bookletMembership, bookletProduct, bookletRemito, bookletSchoolAssignment, bookletStock, bookletStockMovement, user } from '@/lib/db/schema'
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

usarDbTemporal('cuadernillos-remito-despacho-auditoria-')

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

async function sembrar(stock = 100) {
  const planificador = `plan-${randomUUID()}`
  await sembrarUsuario(planificador)
  await getDb().insert(bookletMembership).values({ id: randomUUID(), userId: planificador, capability: 'planning', grantedByUserId: planificador })
  const campaignId = `camp-${randomUUID()}`
  const productId = `prod-${randomUUID()}`
  await getDb().insert(bookletCampaign).values({ id: campaignId, name: campaignId, status: 'active', distributionEnabled: true, overassignmentAllowed: false })
  await getDb().insert(bookletProduct).values({ id: productId, name: productId, levelCode: '1', gradeCode: '1' })
  await getDb().insert(bookletStock).values({ campaignId, productId, quantity: stock })
  const cabecera = cueAleatorio()
  await getDb().insert(bookletSchoolAssignment).values({
    cueAnexo: cabecera, schoolName: `Cabecera ${cabecera}`, relationship: 'cabecera', supervisorName: 'Supervisor',
    supervisorUserId: planificador, cabeceraCue: cabecera, cabeceraUserId: planificador,
    provenance: [{ sourceId: 'fuente', location: 'fila 1' }], confirmedByUserId: planificador, confirmedAt: new Date(),
  })
  return { planificador, campaignId, productId, cabecera, escuelaA: cueAleatorio(), escuelaB: cueAleatorio() }
}

const cuerpo = (s: Awaited<ReturnType<typeof sembrar>>, idempotencyKey: string) => ({
  campaignId: s.campaignId, cabeceraCueAnexo: s.cabecera, idempotencyKey,
  lines: [
    { recipientCueAnexo: s.escuelaA, items: [{ productId: s.productId, quantity: 30 }] },
    { recipientCueAnexo: s.escuelaB, items: [{ productId: s.productId, quantity: 18 }] },
  ],
})

const postReq = (body: unknown) => new Request('http://localhost/api/cuadernillos/remitos', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

async function estado(s: Awaited<ReturnType<typeof sembrar>>) {
  const remitos = await getDb().select().from(bookletRemito).where(eq(bookletRemito.campaignId, s.campaignId))
  const movimientos = await getDb().select().from(bookletStockMovement).where(eq(bookletStockMovement.productId, s.productId))
  const [stock] = await getDb().select().from(bookletStock).where(eq(bookletStock.productId, s.productId))
  return { remitos: remitos.length, movimientos: movimientos.length, stock: stock?.quantity }
}

describe('auditoría del despacho de remitos', () => {
  it('despachar deja un evento cuadernillo.remito_despachar con la cantidad total', async () => {
    const s = await sembrar()
    sesionDePrueba.user = sesion(s.planificador)

    const res = await POST(postReq(cuerpo(s, 'k-despacha-1')))
    expect(res.status).toBe(201)
    const { remito } = await res.json() as { remito: { remitoId: string } }

    expect(await eventoDe(res)).toMatchObject({
      accion: 'cuadernillo.remito_despachar',
      metodo: 'POST',
      rutaPlantilla: '/api/cuadernillos/remitos',
      actorTipo: 'usuario',
      actorId: s.planificador,
      objetoTipo: 'cuadernillo_remito',
      objetoId: remito.remitoId,
      cueAnexo: s.cabecera,
      resultado: 'exito',
      httpStatus: 201,
      metadatos: { cantidad: 48 },
    })
    expect(await estado(s)).toEqual({ remitos: 1, movimientos: 1, stock: 52 })
  })

  it('si no se puede registrar la auditoría responde 503 y no queda remito, movimiento ni descuento', async () => {
    const s = await sembrar()
    sesionDePrueba.user = sesion(s.planificador)

    const res = await conFalloAuditoria(() => POST(postReq(cuerpo(s, 'k-despacha-2'))))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await estado(s)).toEqual({ remitos: 0, movimientos: 0, stock: 100 })
  })

  it('repetir el mismo despacho deja un evento repetido y no vuelve a descontar', async () => {
    const s = await sembrar()
    sesionDePrueba.user = sesion(s.planificador)
    const body = cuerpo(s, 'k-despacha-repite')
    const first = await POST(postReq(body))
    expect(first.status).toBe(201)

    const res = await POST(postReq(body))
    expect(res.status).toBe(201)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'repetido', httpStatus: 201 })
    expect(await res.json()).toEqual(await first.json())
    expect(await estado(s)).toEqual({ remitos: 1, movimientos: 1, stock: 52 })
  })

  it('sin permiso de planificación deja un evento rechazado y no despacha', async () => {
    const s = await sembrar()
    const intruso = `sin-${randomUUID()}`
    await sembrarUsuario(intruso)
    sesionDePrueba.user = sesion(intruso)

    const res = await POST(postReq(cuerpo(s, 'k-despacha-3')))
    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ actorId: intruso, resultado: 'rechazado', httpStatus: 403 })
    expect(await estado(s)).toEqual({ remitos: 0, movimientos: 0, stock: 100 })
  })
})
