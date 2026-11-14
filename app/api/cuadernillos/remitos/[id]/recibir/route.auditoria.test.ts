import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento, bookletCampaign, bookletMembership, bookletProduct, bookletRemito, bookletRemitoItem, bookletRemitoLine, bookletSchoolAssignment, user } from '@/lib/db/schema'
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

usarDbTemporal('cuadernillos-remito-cabecera-auditoria-')

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
  const cuenta = `cab-${randomUUID()}`
  await sembrarUsuario(cuenta)
  await getDb().insert(bookletMembership).values({ id: randomUUID(), userId: cuenta, capability: 'cabecera', grantedByUserId: cuenta })
  const cabecera = cueAleatorio()
  await getDb().insert(bookletSchoolAssignment).values({
    cueAnexo: cabecera, schoolName: `Cabecera ${cabecera}`, relationship: 'cabecera', supervisorName: 'Supervisor',
    supervisorUserId: cuenta, cabeceraCue: cabecera, cabeceraUserId: cuenta,
    provenance: [{ sourceId: 'fuente', location: 'fila 1' }], confirmedByUserId: cuenta, confirmedAt: new Date(),
  })
  const campaignId = `camp-${randomUUID()}`
  const productId = `prod-${randomUUID()}`
  await getDb().insert(bookletCampaign).values({ id: campaignId, name: campaignId, status: 'active', distributionEnabled: true, overassignmentAllowed: false })
  await getDb().insert(bookletProduct).values({ id: productId, name: productId, levelCode: '1', gradeCode: '1' })
  const remitoId = `rem-${randomUUID()}`
  const lineId = `lin-${randomUUID()}`
  await getDb().insert(bookletRemito).values({ id: remitoId, campaignId, cabeceraCueAnexo: cabecera, status: 'dispatched', dispatchedByUserId: cuenta, dispatchedAt: new Date() })
  await getDb().insert(bookletRemitoLine).values({ id: lineId, remitoId, recipientCueAnexo: cueAleatorio(), status: 'in_transit' })
  await getDb().insert(bookletRemitoItem).values({ lineId, productId, dispatchedQuantity: 30 })
  return { cuenta, remitoId, lineId, productId }
}

const cuerpo = (s: Awaited<ReturnType<typeof sembrar>>, idempotencyKey: string) => ({
  idempotencyKey,
  lines: [{ lineId: s.lineId, items: [{ productId: s.productId, receivedQuantity: 30 }] }],
})

function postReq(id: string, body: unknown): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost/api/cuadernillos/remitos/${id}/recibir`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  ]
}

async function estado(s: Awaited<ReturnType<typeof sembrar>>) {
  const [remito] = await getDb().select().from(bookletRemito).where(eq(bookletRemito.id, s.remitoId))
  const [linea] = await getDb().select().from(bookletRemitoLine).where(eq(bookletRemitoLine.id, s.lineId))
  const [item] = await getDb().select().from(bookletRemitoItem).where(eq(bookletRemitoItem.lineId, s.lineId))
  return { remito: remito?.status, firmante: remito?.cabeceraReceivedByUserId ?? null, linea: linea?.status, recibido: item?.cabeceraReceivedQuantity ?? null }
}

describe('auditoría de la recepción del remito en la cabecera', () => {
  it('firmar deja un evento cuadernillo.remito_recibir_cabecera de la cuenta firmante', async () => {
    const s = await sembrar()
    sesionDePrueba.user = sesion(s.cuenta)

    const res = await POST(...postReq(s.remitoId, cuerpo(s, 'k-cab-1')))
    expect(res.status).toBe(200)

    expect(await eventoDe(res)).toMatchObject({
      accion: 'cuadernillo.remito_recibir_cabecera',
      metodo: 'POST',
      rutaPlantilla: '/api/cuadernillos/remitos/[id]/recibir',
      actorTipo: 'usuario',
      actorId: s.cuenta,
      objetoTipo: 'cuadernillo_remito',
      objetoId: s.remitoId,
      resultado: 'exito',
      httpStatus: 200,
      metadatos: { cantidad: 30 },
    })
    expect(await estado(s)).toEqual({ remito: 'received', firmante: s.cuenta, linea: 'at_cabecera', recibido: 30 })
  })

  it('si no se puede registrar la auditoría responde 503 y el remito queda sin firmar', async () => {
    const s = await sembrar()
    sesionDePrueba.user = sesion(s.cuenta)

    const res = await conFalloAuditoria(() => POST(...postReq(s.remitoId, cuerpo(s, 'k-cab-2'))))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await estado(s)).toEqual({ remito: 'dispatched', firmante: null, linea: 'in_transit', recibido: null })
  })

  it('repetir la misma firma deja un evento repetido con el resultado original', async () => {
    const s = await sembrar()
    sesionDePrueba.user = sesion(s.cuenta)
    const body = cuerpo(s, 'k-cab-repite')
    const first = await POST(...postReq(s.remitoId, body))
    expect(first.status).toBe(200)

    const res = await POST(...postReq(s.remitoId, body))
    expect(res.status).toBe(200)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'repetido', httpStatus: 200 })
    expect(await res.json()).toEqual(await first.json())
  })

  it('otra cuenta no puede firmar: evento rechazado y remito intacto', async () => {
    const s = await sembrar()
    const intruso = `otra-${randomUUID()}`
    await sembrarUsuario(intruso)
    sesionDePrueba.user = sesion(intruso)

    const res = await POST(...postReq(s.remitoId, cuerpo(s, 'k-cab-3')))
    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ actorId: intruso, resultado: 'rechazado', httpStatus: 403 })
    expect(await estado(s)).toEqual({ remito: 'dispatched', firmante: null, linea: 'in_transit', recibido: null })
  })
})
