import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento, infraMovimiento, infraParte, infraVerificacion } from '@/lib/db/schema'
import { ensureSeeded, PERIODO_ENOS_2026_2027_ID } from '@/lib/db/seed'
import { _resetLimitesParaTests } from '@/lib/infraestructura/limites'
import { crearVerificacion, obtenerVerificacion } from '@/lib/infraestructura/verificaciones'
import { POST } from './route'

usarDbTemporal('vincular-auditoria-', { seed: false })

beforeAll(async () => {
  await ensureSeeded()
})

beforeEach(() => {
  _resetLimitesParaTests()
})

let contadorCue = 0
function cueUnico(): string {
  contadorCue += 1
  return `1801605-5${String(contadorCue).padStart(2, '0')}`
}

async function verificacionPendiente(cueAnexo: string) {
  const creada = await crearVerificacion({ cueAnexo, solicitadaPorUserId: 'user-director' })
  if (!creada.ok) throw new Error(`no se pudo crear la verificación: ${creada.motivo}`)
  return creada
}

// Movimiento real de un parte del CUE indicado (la FK de movimiento_id está enforced).
async function movimientoDePrueba(cueAnexo: string): Promise<string> {
  const db = getDb()
  const ahora = new Date().toISOString()
  const parteId = randomUUID()
  await db.insert(infraParte).values({
    id: parteId,
    periodoId: PERIODO_ENOS_2026_2027_ID,
    cueAnexo,
    estadoEstablecimiento: 'habitual',
    estadoEstablecimientoRigeDesde: ahora,
    corteId: 1,
    creadaEn: ahora,
    actualizadaEn: ahora,
  })
  const movimientoId = randomUUID()
  await db.insert(infraMovimiento).values({
    id: movimientoId,
    parteId,
    tipo: 'reporte_inicial',
    rol: 'director',
    resumen: {},
    rigeDesde: ahora,
    creadaEn: ahora,
    idempotencyKey: null,
  })
  return movimientoId
}

function postReq(id: string, body: unknown): Request {
  return new Request(`http://localhost/api/problematicas/verificaciones/${id}/vincular-movimiento`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.5.0.1' },
    body: JSON.stringify(body),
  })
}

function contexto(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

describe('auditoría de POST /api/problematicas/verificaciones/[id]/vincular-movimiento', () => {
  it('vínculo válido deja un evento con el movimiento en metadatos y sin token', async () => {
    const cue = cueUnico()
    const { token, verificacion } = await verificacionPendiente(cue)
    const movimientoId = await movimientoDePrueba(cue)

    const res = await POST(postReq(verificacion.id, { token, movimientoId }), contexto(verificacion.id))
    expect(res.status).toBe(200)

    const evento = await eventoDe(res)
    expect(evento).toMatchObject({
      accion: 'verificacion.vincular_movimiento',
      actorTipo: 'enlace',
      actorId: verificacion.id,
      objetoId: verificacion.id,
      cueAnexo: cue,
      resultado: 'exito',
      httpStatus: 200,
      metadatos: { verificacionId: verificacion.id, movimientoId },
    })
    expect(JSON.stringify(evento)).not.toContain(token)
  })

  it('movimiento de otro CUE deja un evento conflicto y no vincula nada', async () => {
    const cue = cueUnico()
    const { token, verificacion } = await verificacionPendiente(cue)
    const movimientoAjeno = await movimientoDePrueba(cueUnico())

    const res = await POST(postReq(verificacion.id, { token, movimientoId: movimientoAjeno }), contexto(verificacion.id))
    expect(res.status).toBe(409)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'conflicto', httpStatus: 409 })
    expect((await obtenerVerificacion(verificacion.id))?.movimientoId).toBeNull()
  })

  it('si no se puede registrar la auditoría responde 503 y el vínculo se revierte', async () => {
    const cue = cueUnico()
    const { token, verificacion } = await verificacionPendiente(cue)
    const movimientoId = await movimientoDePrueba(cue)

    const res = await conFalloAuditoria(() => POST(postReq(verificacion.id, { token, movimientoId }), contexto(verificacion.id)))
    expect(res.status).toBe(503)
    const [fila] = await getDb().select().from(infraVerificacion).where(eq(infraVerificacion.id, verificacion.id))
    expect(fila?.estado).toBe('pendiente')
    expect(fila?.movimientoId).toBeNull()
  })
})
