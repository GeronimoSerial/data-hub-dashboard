import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento, infraVerificacion } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { _resetLimitesParaTests } from '@/lib/infraestructura/limites'
import { crearVerificacion } from '@/lib/infraestructura/verificaciones'
import { POST } from './route'

usarDbTemporal('validar-auditoria-', { seed: false })

beforeAll(async () => {
  await ensureSeeded()
})

beforeEach(() => {
  _resetLimitesParaTests()
})

let contadorCue = 0
function cueUnico(): string {
  contadorCue += 1
  return `1801605-6${String(contadorCue).padStart(2, '0')}`
}

async function verificacionPendiente() {
  const creada = await crearVerificacion({ cueAnexo: cueUnico(), solicitadaPorUserId: 'user-director' })
  if (!creada.ok) throw new Error(`no se pudo crear la verificación: ${creada.motivo}`)
  return creada
}

function postReq(id: string, body: unknown): Request {
  return new Request(`http://localhost/api/problematicas/verificaciones/${id}/validar-token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.6.0.1' },
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

describe('auditoría de POST /api/problematicas/verificaciones/[id]/validar-token', () => {
  it('token válido deja un evento exitoso sin el token', async () => {
    const { token, verificacion } = await verificacionPendiente()

    const res = await POST(postReq(verificacion.id, { token }), contexto(verificacion.id))
    expect(res.status).toBe(200)

    const evento = await eventoDe(res)
    expect(evento).toMatchObject({
      accion: 'verificacion.validar_token',
      actorTipo: 'enlace',
      actorId: verificacion.id,
      objetoId: verificacion.id,
      cueAnexo: verificacion.cueAnexo,
      resultado: 'exito',
      httpStatus: 200,
    })
    expect(JSON.stringify(evento)).not.toContain(token)
  })

  it('token inválido deja un evento rechazado', async () => {
    const { verificacion } = await verificacionPendiente()

    const res = await POST(postReq(verificacion.id, { token: 'token-malo' }), contexto(verificacion.id))
    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'rechazado', httpStatus: 403 })
  })

  it('token vencido deja un evento invalido con status 410', async () => {
    const { token, verificacion } = await verificacionPendiente()
    await getDb().update(infraVerificacion).set({ tokenExpiraEn: '2001-01-01T00:00:00.000Z' }).where(eq(infraVerificacion.id, verificacion.id))

    const res = await POST(postReq(verificacion.id, { token }), contexto(verificacion.id))
    expect(res.status).toBe(410)
    const evento = await eventoDe(res)
    expect(evento).toMatchObject({ resultado: 'invalido', httpStatus: 410 })
    expect(JSON.stringify(evento)).not.toContain(token)
  })

  it('si no se puede registrar la auditoría responde 503 y no entrega cookies', async () => {
    const { token, verificacion } = await verificacionPendiente()

    const res = await conFalloAuditoria(() => POST(postReq(verificacion.id, { token }), contexto(verificacion.id)))
    expect(res.status).toBe(503)
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})
