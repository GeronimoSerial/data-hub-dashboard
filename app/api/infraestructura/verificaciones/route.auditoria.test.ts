import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento, infraPeriodo } from '@/lib/db/schema'
import { listarVerificaciones } from '@/lib/infraestructura/verificaciones'
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

usarDbTemporal('verificaciones-auditoria-')

beforeEach(() => {
  sesionDePrueba.user = null
})

const editor = () => ({ id: 'editor-1', role: 'editor', banned: false })
const consulta = () => ({ id: 'consulta-1', role: 'consulta', banned: false })

let contadorCue = 0
function cueUnico(): string {
  contadorCue += 1
  return `1801605-4${String(contadorCue).padStart(2, '0')}`
}

function postReq(body: unknown): Request {
  return new Request('http://localhost/api/infraestructura/verificaciones', {
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

describe('auditoría de POST /api/infraestructura/verificaciones', () => {
  it('alta por staff deja un evento de usuario con la verificación como objeto, sin token', async () => {
    sesionDePrueba.user = editor()
    const cue = cueUnico()

    const res = await POST(postReq({ cueAnexo: cue }))
    expect(res.status).toBe(201)
    const body = await res.json()

    const evento = await eventoDe(res)
    expect(evento).toMatchObject({
      accion: 'verificacion.crear',
      rutaPlantilla: '/api/infraestructura/verificaciones',
      actorTipo: 'usuario',
      actorId: 'editor-1',
      viaAcceso: 'sesion',
      objetoTipo: 'verificacion',
      objetoId: body.verificacion.id,
      cueAnexo: cue,
      resultado: 'exito',
      httpStatus: 201,
      metadatos: { verificacionId: body.verificacion.id },
    })
    expect(JSON.stringify(evento)).not.toContain(body.token)
  })

  it('consulta sin permiso deja un evento rechazado y no crea nada', async () => {
    sesionDePrueba.user = consulta()
    const cue = cueUnico()

    const res = await POST(postReq({ cueAnexo: cue }))
    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ actorId: 'consulta-1', resultado: 'rechazado', httpStatus: 403 })
    expect(await listarVerificaciones({ cueAnexo: cue })).toHaveLength(0)
  })

  it('sin período vigente deja un evento conflicto y no crea la verificación', async () => {
    sesionDePrueba.user = editor()
    const cue = cueUnico()
    const db = getDb()
    const [periodo] = await db.select().from(infraPeriodo).where(eq(infraPeriodo.estado, 'vigente'))
    await db.update(infraPeriodo).set({ estado: 'historico' }).where(eq(infraPeriodo.id, periodo!.id))
    try {
      const res = await POST(postReq({ cueAnexo: cue }))
      expect(res.status).toBe(409)
      expect(await eventoDe(res)).toMatchObject({ resultado: 'conflicto', httpStatus: 409 })
      expect(await listarVerificaciones({ cueAnexo: cue })).toHaveLength(0)
    } finally {
      await db.update(infraPeriodo).set({ estado: 'vigente' }).where(eq(infraPeriodo.id, periodo!.id))
    }
  })

  it('si no se puede registrar la auditoría responde 503 y no deja la verificación', async () => {
    sesionDePrueba.user = editor()
    const cue = cueUnico()

    const res = await conFalloAuditoria(() => POST(postReq({ cueAnexo: cue })))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await listarVerificaciones({ cueAnexo: cue })).toHaveLength(0)
  })
})
