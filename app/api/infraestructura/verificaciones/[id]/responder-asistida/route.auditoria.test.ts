import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento } from '@/lib/db/schema'
import { crearVerificacion, obtenerVerificacion } from '@/lib/infraestructura/verificaciones'
import { POST } from './route'

vi.mock('@/lib/session', async () => {
  const { observarUsuarioAuditoria } = await import('@/lib/infraestructura/auditoria/contexto')
  return {
    getSessionUser: vi.fn(async () => {
      const user = sesionDePrueba.user
      observarUsuarioAuditoria(user)
      return user
    }),
    staffGuard: (user: { banned: boolean; role: string } | null) => {
      if (!user) return { status: 401 as const, error: 'No autenticado' }
      if (user.banned || (user.role !== 'admin' && user.role !== 'editor')) {
        return { status: 403 as const, error: 'No tiene acceso a este recurso' }
      }
      return null
    },
  }
})

const sesionDePrueba: { user: { id: string; role: string; banned: boolean } | null } = { user: null }

usarDbTemporal('asistida-auditoria-')

beforeEach(() => {
  sesionDePrueba.user = null
})

const editor = () => ({ id: 'editor-1', role: 'editor', banned: false })
const OBSERVACION = 'Acordado por teléfono con la directora del anexo'

let contadorCue = 0
async function verificacionPendiente() {
  contadorCue += 1
  const creada = await crearVerificacion({ cueAnexo: `1801605-2${String(contadorCue).padStart(2, '0')}`, solicitadaPorUserId: 'editor-1' })
  if (!creada.ok) throw new Error(`no se pudo crear la verificación: ${creada.motivo}`)
  return creada.verificacion
}

function postReq(id: string, body: unknown): Request {
  return new Request(`http://localhost/api/infraestructura/verificaciones/${id}/responder-asistida`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const contexto = (id: string) => ({ params: Promise.resolve({ id }) })
const cuerpo = { canal: 'telefono', resultado: 'sin_afectacion', observacion: OBSERVACION }

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

describe('auditoría de POST /api/infraestructura/verificaciones/[id]/responder-asistida', () => {
  it('respuesta asistida deja un evento de usuario sin el texto de la observación', async () => {
    sesionDePrueba.user = editor()
    const verificacion = await verificacionPendiente()

    const res = await POST(postReq(verificacion.id, cuerpo), contexto(verificacion.id))
    expect(res.status).toBe(200)

    const evento = await eventoDe(res)
    expect(evento).toMatchObject({
      accion: 'verificacion.responder_asistida',
      actorTipo: 'usuario',
      actorId: 'editor-1',
      objetoId: verificacion.id,
      cueAnexo: verificacion.cueAnexo,
      resultado: 'exito',
      httpStatus: 200,
      metadatos: { verificacionId: verificacion.id },
    })
    expect(JSON.stringify(evento)).not.toContain(OBSERVACION)
    expect((await obtenerVerificacion(verificacion.id))?.observacion).toBe(OBSERVACION)
  })

  it('repetir la misma respuesta asistida deja un evento repetido sin escribir de nuevo', async () => {
    sesionDePrueba.user = editor()
    const verificacion = await verificacionPendiente()
    await POST(postReq(verificacion.id, cuerpo), contexto(verificacion.id))
    const antes = await obtenerVerificacion(verificacion.id)

    const res = await POST(postReq(verificacion.id, cuerpo), contexto(verificacion.id))
    expect(res.status).toBe(200)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'repetido', httpStatus: 200 })
    expect((await obtenerVerificacion(verificacion.id))?.respondidaEn).toBe(antes?.respondidaEn)
  })

  it('sin observación deja un evento invalido y responde 400 con el mensaje vigente', async () => {
    sesionDePrueba.user = editor()
    const verificacion = await verificacionPendiente()

    const res = await POST(postReq(verificacion.id, { ...cuerpo, observacion: '   ' }), contexto(verificacion.id))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'La observación es obligatoria' })
    expect(await eventoDe(res)).toMatchObject({ resultado: 'invalido', httpStatus: 400 })
    expect((await obtenerVerificacion(verificacion.id))?.estado).toBe('pendiente')
  })

  it('si no se puede registrar la auditoría responde 503 y la verificación sigue pendiente', async () => {
    sesionDePrueba.user = editor()
    const verificacion = await verificacionPendiente()

    const res = await conFalloAuditoria(() => POST(postReq(verificacion.id, cuerpo), contexto(verificacion.id)))
    expect(res.status).toBe(503)
    expect((await obtenerVerificacion(verificacion.id))?.estado).toBe('pendiente')
  })
})
