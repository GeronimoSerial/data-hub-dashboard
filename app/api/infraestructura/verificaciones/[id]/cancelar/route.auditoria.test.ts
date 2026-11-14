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

usarDbTemporal('cancelar-auditoria-')

beforeEach(() => {
  sesionDePrueba.user = null
})

const admin = () => ({ id: 'admin-1', role: 'admin', banned: false })
const consulta = () => ({ id: 'consulta-1', role: 'consulta', banned: false })

let contadorCue = 0
async function verificacionPendiente() {
  contadorCue += 1
  const creada = await crearVerificacion({ cueAnexo: `1801605-3${String(contadorCue).padStart(2, '0')}`, solicitadaPorUserId: 'admin-1' })
  if (!creada.ok) throw new Error(`no se pudo crear la verificación: ${creada.motivo}`)
  return creada.verificacion
}

function postReq(id: string): Request {
  return new Request(`http://localhost/api/infraestructura/verificaciones/${id}/cancelar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ motivo: 'carga duplicada' }),
  })
}

const contexto = (id: string) => ({ params: Promise.resolve({ id }) })

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

describe('auditoría de POST /api/infraestructura/verificaciones/[id]/cancelar', () => {
  it('cancelación deja un evento del admin con la verificación como objeto', async () => {
    sesionDePrueba.user = admin()
    const verificacion = await verificacionPendiente()

    const res = await POST(postReq(verificacion.id), contexto(verificacion.id))
    expect(res.status).toBe(200)

    expect(await eventoDe(res)).toMatchObject({
      accion: 'verificacion.cancelar',
      rutaPlantilla: '/api/infraestructura/verificaciones/[id]/cancelar',
      actorTipo: 'usuario',
      actorId: 'admin-1',
      objetoTipo: 'verificacion',
      objetoId: verificacion.id,
      cueAnexo: verificacion.cueAnexo,
      resultado: 'exito',
      httpStatus: 200,
      metadatos: { verificacionId: verificacion.id },
    })
  })

  it('cancelar de nuevo deja un evento conflicto sin cambios', async () => {
    sesionDePrueba.user = admin()
    const verificacion = await verificacionPendiente()
    await POST(postReq(verificacion.id), contexto(verificacion.id))

    const res = await POST(postReq(verificacion.id), contexto(verificacion.id))
    expect(res.status).toBe(409)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'conflicto', httpStatus: 409 })
  })

  it('usuario sin rol staff deja un evento rechazado', async () => {
    sesionDePrueba.user = consulta()
    const verificacion = await verificacionPendiente()

    const res = await POST(postReq(verificacion.id), contexto(verificacion.id))
    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ actorId: 'consulta-1', resultado: 'rechazado', httpStatus: 403 })
    expect((await obtenerVerificacion(verificacion.id))?.estado).toBe('pendiente')
  })

  it('si no se puede registrar la auditoría responde 503 y la verificación sigue pendiente', async () => {
    sesionDePrueba.user = admin()
    const verificacion = await verificacionPendiente()

    const res = await conFalloAuditoria(() => POST(postReq(verificacion.id), contexto(verificacion.id)))
    expect(res.status).toBe(503)
    expect((await obtenerVerificacion(verificacion.id))?.estado).toBe('pendiente')
  })
})
