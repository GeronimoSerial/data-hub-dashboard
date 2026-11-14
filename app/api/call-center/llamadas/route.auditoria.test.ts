import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento, callCenterLlamadas } from '@/lib/db/schema'
import { POST } from './route'

vi.mock('@/lib/session', async () => {
  const { observarUsuarioAuditoria } = await import('@/lib/infraestructura/auditoria/contexto')
  return {
    getSessionUser: vi.fn(async () => {
      const user = sesionDePrueba.user
      observarUsuarioAuditoria(user)
      return user
    }),
  }
})

const sesionDePrueba: { user: ReturnType<typeof sesion> | null } = { user: null }

usarDbTemporal('llamadas-auditoria-')

beforeEach(() => {
  sesionDePrueba.user = null
})

const CUE = '1234567-01'

function sesion(role: string = 'admin') {
  return {
    id: `${role}-aud`,
    role,
    banned: false,
    nivelJurIds: [],
    accesoRecursos: 'todos' as const,
    recursoIds: [],
  }
}

function entrada(extra: Record<string, unknown> = {}) {
  return {
    cueAnexo: CUE,
    callerNombre: `Persona ${randomUUID()}`,
    justificacion: `Justificación ${randomUUID()}`,
    respuestaDirector: `Respuesta ${randomUUID()}`,
    ...extra,
  }
}

function postReq(body: unknown): Request {
  return new Request('http://localhost/api/call-center/llamadas', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

async function llamadasCon(justificacion: string) {
  return getDb().select().from(callCenterLlamadas).where(eq(callCenterLlamadas.justificacion, justificacion))
}

describe('auditoría de llamadas del call center', () => {
  it('registrar una llamada deja un evento call_center.llamada_crear del usuario', async () => {
    sesionDePrueba.user = sesion('admin')
    const body = entrada()

    const res = await POST(postReq(body))
    expect(res.status).toBe(201)
    const { llamada } = (await res.json()) as { llamada: { id: string } }

    expect(await eventoDe(res)).toMatchObject({
      accion: 'call_center.llamada_crear',
      metodo: 'POST',
      rutaPlantilla: '/api/call-center/llamadas',
      actorTipo: 'usuario',
      actorId: 'admin-aud',
      objetoTipo: 'llamada',
      objetoId: llamada.id,
      cueAnexo: CUE,
      resultado: 'exito',
      httpStatus: 201,
    })
    expect(await llamadasCon(body.justificacion)).toHaveLength(1)
  })

  it('el evento no guarda el nombre, la justificación ni la respuesta del director', async () => {
    sesionDePrueba.user = sesion('admin')
    const body = entrada()

    const res = await POST(postReq(body))
    const evento = await eventoDe(res)
    const serializado = JSON.stringify(evento)
    expect(serializado).not.toContain(body.callerNombre)
    expect(serializado).not.toContain(body.justificacion)
    expect(serializado).not.toContain(body.respuestaDirector)
  })

  it('una validación inválida deja un evento invalido y no guarda la llamada', async () => {
    sesionDePrueba.user = sesion('admin')
    const body = entrada({ callerNombre: '' })

    const res = await POST(postReq(body))
    expect(res.status).toBe(400)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'invalido', httpStatus: 400 })
    expect(await llamadasCon(body.justificacion)).toHaveLength(0)
  })

  it('sin permiso de call center deja un evento rechazado y no guarda la llamada', async () => {
    sesionDePrueba.user = sesion('operador_establecimiento')
    const body = entrada()

    const res = await POST(postReq(body))
    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({
      actorId: 'operador_establecimiento-aud',
      resultado: 'rechazado',
      httpStatus: 403,
    })
    expect(await llamadasCon(body.justificacion)).toHaveLength(0)
  })

  it('sin sesión deja un evento rechazado de actor anónimo', async () => {
    sesionDePrueba.user = null

    const res = await POST(postReq(entrada()))
    expect(res.status).toBe(401)
    expect(await eventoDe(res)).toMatchObject({
      actorTipo: 'anonimo',
      actorId: null,
      resultado: 'rechazado',
      httpStatus: 401,
    })
  })

  it('si la auditoría no puede guardarse responde 503 y la llamada se revierte', async () => {
    sesionDePrueba.user = sesion('admin')
    const body = entrada()

    const res = await conFalloAuditoria(() => POST(postReq(body)))
    expect(res.status).toBe(503)
    expect(((await res.json()) as { code: string }).code).toBe('auditoria_no_disponible')
    expect(await llamadasCon(body.justificacion)).toHaveLength(0)
  })
})
