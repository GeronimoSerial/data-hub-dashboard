import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento, bookletCampaign, bookletProduct, bookletRemito, bookletSchoolAssignment, bookletRemitoItem, bookletRemitoLine, user } from '@/lib/db/schema'
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

usarDbTemporal('cuadernillos-remito-escuela-auditoria-')

const sesion = (id: string, role = 'consulta', cueAnexo: string | null = null): Sesion => ({ id, role, banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [], cueAnexo })
const cueAleatorio = () => String(100_000_000 + Math.floor(Math.random() * 899_999_999))
const cueConGuion = (cue: string) => `${cue.slice(0, 7)}-${cue.slice(7)}`

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
  const cuenta = `esc-${randomUUID()}`
  await sembrarUsuario(cuenta)
  const planificador = `plan-${randomUUID()}`
  await sembrarUsuario(planificador)
  const escuela = cueAleatorio()
  const cabecera = cueAleatorio()
  await getDb().insert(bookletSchoolAssignment).values({
    cueAnexo: cabecera, schoolName: `Cabecera ${cabecera}`, relationship: 'cabecera', supervisorName: 'Supervisor',
    supervisorUserId: planificador, cabeceraCue: cabecera, cabeceraUserId: planificador,
    provenance: [{ sourceId: 'fuente', location: 'fila 1' }], confirmedByUserId: planificador, confirmedAt: new Date(),
  })
  const campaignId = `camp-${randomUUID()}`
  const productId = `prod-${randomUUID()}`
  await getDb().insert(bookletCampaign).values({ id: campaignId, name: campaignId, status: 'active', distributionEnabled: true, overassignmentAllowed: false })
  await getDb().insert(bookletProduct).values({ id: productId, name: productId, levelCode: '1', gradeCode: '1' })
  const remitoId = `rem-${randomUUID()}`
  const lineId = `lin-${randomUUID()}`
  await getDb().insert(bookletRemito).values({ id: remitoId, campaignId, cabeceraCueAnexo: cabecera, status: 'received', dispatchedByUserId: planificador, dispatchedAt: new Date(), cabeceraReceivedByUserId: planificador, cabeceraReceivedAt: new Date() })
  await getDb().insert(bookletRemitoLine).values({ id: lineId, remitoId, recipientCueAnexo: escuela, status: 'at_cabecera' })
  await getDb().insert(bookletRemitoItem).values({ lineId, productId, dispatchedQuantity: 30, cabeceraReceivedQuantity: 30 })
  return { cuenta, escuela, lineId, productId }
}

const cuerpo = (s: Awaited<ReturnType<typeof sembrar>>, idempotencyKey: string) => ({
  idempotencyKey,
  items: [{ productId: s.productId, receivedQuantity: 30 }],
})

function postReq(id: string, body: unknown): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost/api/cuadernillos/remito-lineas/${id}/recibir`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  ]
}

async function estado(s: Awaited<ReturnType<typeof sembrar>>) {
  const [linea] = await getDb().select().from(bookletRemitoLine).where(eq(bookletRemitoLine.id, s.lineId))
  const [item] = await getDb().select().from(bookletRemitoItem).where(eq(bookletRemitoItem.lineId, s.lineId))
  return { linea: linea?.status, firmante: linea?.schoolReceivedByUserId ?? null, recibido: item?.schoolReceivedQuantity ?? null }
}

describe('auditoría de la recepción de la línea en la escuela', () => {
  it('firmar deja un evento cuadernillo.remito_recibir_escuela de la cuenta de la escuela', async () => {
    const s = await sembrar()
    sesionDePrueba.user = sesion(s.cuenta, 'operador_establecimiento', cueConGuion(s.escuela))

    const res = await POST(...postReq(s.lineId, cuerpo(s, 'k-esc-1')))
    expect(res.status).toBe(200)

    expect(await eventoDe(res)).toMatchObject({
      accion: 'cuadernillo.remito_recibir_escuela',
      metodo: 'POST',
      rutaPlantilla: '/api/cuadernillos/remito-lineas/[id]/recibir',
      actorTipo: 'usuario',
      actorId: s.cuenta,
      objetoTipo: 'cuadernillo_remito_linea',
      objetoId: s.lineId,
      cueAnexo: cueConGuion(s.escuela),
      resultado: 'exito',
      httpStatus: 200,
      metadatos: { cantidad: 30 },
    })
    expect(await estado(s)).toEqual({ linea: 'received', firmante: s.cuenta, recibido: 30 })
  })

  it('si no se puede registrar la auditoría responde 503 y la línea queda sin firmar', async () => {
    const s = await sembrar()
    sesionDePrueba.user = sesion(s.cuenta, 'operador_establecimiento', cueConGuion(s.escuela))

    const res = await conFalloAuditoria(() => POST(...postReq(s.lineId, cuerpo(s, 'k-esc-2'))))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await estado(s)).toEqual({ linea: 'at_cabecera', firmante: null, recibido: null })
  })

  it('repetir la misma firma deja un evento repetido con el resultado original', async () => {
    const s = await sembrar()
    sesionDePrueba.user = sesion(s.cuenta, 'operador_establecimiento', cueConGuion(s.escuela))
    const body = cuerpo(s, 'k-esc-repite')
    const first = await POST(...postReq(s.lineId, body))
    expect(first.status).toBe(200)

    const res = await POST(...postReq(s.lineId, body))
    expect(res.status).toBe(200)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'repetido', httpStatus: 200 })
    expect(await res.json()).toEqual(await first.json())
  })

  it('una escuela de otro CUE no puede firmar: evento rechazado y línea intacta', async () => {
    const s = await sembrar()
    sesionDePrueba.user = sesion(s.cuenta, 'operador_establecimiento', cueConGuion(cueAleatorio()))

    const res = await POST(...postReq(s.lineId, cuerpo(s, 'k-esc-3')))
    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ actorId: s.cuenta, resultado: 'rechazado', httpStatus: 403 })
    expect(await estado(s)).toEqual({ linea: 'at_cabecera', firmante: null, recibido: null })
  })
})
