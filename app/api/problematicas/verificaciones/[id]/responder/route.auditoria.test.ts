import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento, infraVerificacionEvento } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { _resetLimitesParaTests } from '@/lib/infraestructura/limites'
import { crearVerificacion, obtenerVerificacion } from '@/lib/infraestructura/verificaciones'
import { POST } from './route'

usarDbTemporal('responder-auditoria-', { seed: false })

beforeAll(async () => {
  await ensureSeeded()
})

beforeEach(() => {
  _resetLimitesParaTests()
})

let contadorCue = 0
function cueUnico(): string {
  contadorCue += 1
  return `1801605-9${String(contadorCue).padStart(2, '0')}`
}

async function verificacionPendiente() {
  const creada = await crearVerificacion({ cueAnexo: cueUnico(), solicitadaPorUserId: 'user-director' })
  if (!creada.ok) throw new Error(`no se pudo crear la verificación: ${creada.motivo}`)
  return creada
}

function postReq(id: string, body: unknown): Request {
  return new Request(`http://localhost/api/problematicas/verificaciones/${id}/responder`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.9.0.1' },
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

describe('auditoría de POST /api/problematicas/verificaciones/[id]/responder', () => {
  it('respuesta válida deja un evento del enlace con la verificación como objeto, sin token', async () => {
    const { token, verificacion } = await verificacionPendiente()

    const res = await POST(postReq(verificacion.id, { token, resultado: 'sin_afectacion' }), contexto(verificacion.id))
    expect(res.status).toBe(200)

    const evento = await eventoDe(res)
    expect(evento).toMatchObject({
      accion: 'verificacion.responder',
      metodo: 'POST',
      rutaPlantilla: '/api/problematicas/verificaciones/[id]/responder',
      actorTipo: 'enlace',
      actorId: verificacion.id,
      viaAcceso: 'enlace',
      objetoTipo: 'verificacion',
      objetoId: verificacion.id,
      cueAnexo: verificacion.cueAnexo,
      resultado: 'exito',
      httpStatus: 200,
      metadatos: { verificacionId: verificacion.id },
    })
    expect(JSON.stringify(evento)).not.toContain(token)
  })

  it('credencial inválida deja un evento rechazado y no cambia la verificación', async () => {
    const { verificacion } = await verificacionPendiente()

    const res = await POST(postReq(verificacion.id, { token: 'token-malo', resultado: 'sin_afectacion' }), contexto(verificacion.id))
    expect(res.status).toBe(403)

    const evento = await eventoDe(res)
    expect(evento).toMatchObject({ resultado: 'rechazado', httpStatus: 403, objetoId: verificacion.id })
    expect(JSON.stringify(evento)).not.toContain('token-malo')
    expect((await obtenerVerificacion(verificacion.id))?.estado).toBe('pendiente')
  })

  it('repetir la misma respuesta no escribe un segundo evento de dominio y registra repetido', async () => {
    const { token, verificacion } = await verificacionPendiente()
    await POST(postReq(verificacion.id, { token, resultado: 'sin_afectacion' }), contexto(verificacion.id))
    const antes = await obtenerVerificacion(verificacion.id)
    const historialAntes = await getDb().select().from(infraVerificacionEvento).where(eq(infraVerificacionEvento.verificacionId, verificacion.id))

    const res = await POST(postReq(verificacion.id, { token, resultado: 'sin_afectacion' }), contexto(verificacion.id))
    expect(res.status).toBe(200)

    const evento = await eventoDe(res)
    expect(evento).toMatchObject({ resultado: 'repetido', httpStatus: 200 })
    const despues = await obtenerVerificacion(verificacion.id)
    expect(despues?.respondidaEn).toBe(antes?.respondidaEn)
    const historialDespues = await getDb().select().from(infraVerificacionEvento).where(eq(infraVerificacionEvento.verificacionId, verificacion.id))
    expect(historialDespues).toHaveLength(historialAntes.length)
  })

  it('respuesta contradictoria deja un evento conflicto', async () => {
    const { token, verificacion } = await verificacionPendiente()
    await POST(postReq(verificacion.id, { token, resultado: 'sin_afectacion' }), contexto(verificacion.id))

    const res = await POST(postReq(verificacion.id, { token, resultado: 'no_disponible' }), contexto(verificacion.id))
    expect(res.status).toBe(409)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'conflicto', httpStatus: 409 })
  })

  it('si no se puede registrar la auditoría responde 503 y revierte la respuesta', async () => {
    const { token, verificacion } = await verificacionPendiente()

    const res = await conFalloAuditoria(() => POST(postReq(verificacion.id, { token, resultado: 'sin_afectacion' }), contexto(verificacion.id)))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect((await obtenerVerificacion(verificacion.id))?.estado).toBe('pendiente')
  })
})
