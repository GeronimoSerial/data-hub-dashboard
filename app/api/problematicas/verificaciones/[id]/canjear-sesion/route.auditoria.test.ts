import { eq } from 'drizzle-orm'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { _resetLimitesParaTests } from '@/lib/infraestructura/limites'
import { crearVerificacion, responderPorEnlace } from '@/lib/infraestructura/verificaciones'
import { POST } from './route'

usarDbTemporal('canjear-auditoria-', {
  seed: false,
  env: { PROBLEMATICAS_ACCESO_PASSWORD: 'clave-de-prueba-auditoria-0123456789' },
})

beforeAll(async () => {
  await ensureSeeded()
})

beforeEach(() => {
  _resetLimitesParaTests()
})

let contadorCue = 0
function cueUnico(): string {
  contadorCue += 1
  return `1801605-7${String(contadorCue).padStart(2, '0')}`
}

async function verificacionPendiente() {
  const creada = await crearVerificacion({ cueAnexo: cueUnico(), solicitadaPorUserId: 'user-director' })
  if (!creada.ok) throw new Error(`no se pudo crear la verificación: ${creada.motivo}`)
  return creada
}

function postReq(id: string, body: unknown): Request {
  return new Request(`http://localhost/api/problematicas/verificaciones/${id}/canjear-sesion`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.7.0.1' },
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

describe('auditoría de POST /api/problematicas/verificaciones/[id]/canjear-sesion', () => {
  it('canje válido deja un evento del enlace sin token ni valor de cookie', async () => {
    const { token, verificacion } = await verificacionPendiente()

    const res = await POST(postReq(verificacion.id, { token }), contexto(verificacion.id))
    expect(res.status).toBe(200)
    const valorCookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!.split('=').slice(1).join('=')
    expect(valorCookie.length).toBeGreaterThan(0)

    const evento = await eventoDe(res)
    expect(evento).toMatchObject({
      accion: 'verificacion.canjear_sesion',
      rutaPlantilla: '/api/problematicas/verificaciones/[id]/canjear-sesion',
      actorTipo: 'enlace',
      actorId: verificacion.id,
      objetoTipo: 'verificacion',
      objetoId: verificacion.id,
      resultado: 'exito',
      httpStatus: 200,
      metadatos: { verificacionId: verificacion.id },
    })
    expect(JSON.stringify(evento)).not.toContain(token)
    expect(JSON.stringify(evento)).not.toContain(valorCookie)
  })

  it('token inválido deja un evento rechazado', async () => {
    const { verificacion } = await verificacionPendiente()

    const res = await POST(postReq(verificacion.id, { token: 'token-malo' }), contexto(verificacion.id))
    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'rechazado', httpStatus: 403 })
  })

  it('solicitud ya respondida deja un evento conflicto', async () => {
    const { token, verificacion } = await verificacionPendiente()
    await responderPorEnlace({ verificacionId: verificacion.id, token, resultado: 'sin_afectacion', movimientoId: null })

    const res = await POST(postReq(verificacion.id, { token }), contexto(verificacion.id))
    expect(res.status).toBe(409)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'conflicto', httpStatus: 409 })
  })

  it('si no se puede registrar la auditoría responde 503 sin cookie de sesión', async () => {
    const { token, verificacion } = await verificacionPendiente()

    const res = await conFalloAuditoria(() => POST(postReq(verificacion.id, { token }), contexto(verificacion.id)))
    expect(res.status).toBe(503)
    expect(res.headers.get('set-cookie')).toBeNull()
  })
})
