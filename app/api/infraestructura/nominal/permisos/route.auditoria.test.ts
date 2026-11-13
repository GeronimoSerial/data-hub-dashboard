import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento, infraPermisoNominal } from '@/lib/db/schema'
import { DELETE, POST } from './route'

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

const sesionDePrueba: { user: { id: string; role: string; banned: boolean } | null } = { user: null }

usarDbTemporal('permisos-auditoria-')

beforeEach(() => {
  sesionDePrueba.user = null
})

const admin = () => ({ id: 'admin-1', role: 'admin', banned: false })
const editor = () => ({ id: 'editor-1', role: 'editor', banned: false })
const venceEn = () => new Date(Date.now() + 86_400_000).toISOString()

function postReq(body: unknown): Request {
  return new Request('http://localhost/api/infraestructura/nominal/permisos', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function deleteReq(id: string): Request {
  return new Request(`http://localhost/api/infraestructura/nominal/permisos?id=${id}`, { method: 'DELETE' })
}

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

describe('auditoría de permisos nominales', () => {
  it('otorgar deja un evento permiso_nominal.otorgar del admin con el permiso como objeto', async () => {
    sesionDePrueba.user = admin()
    const userId = `usuario-${randomUUID()}`

    const res = await POST(postReq({ userId, venceEn: venceEn() }))
    expect(res.status).toBe(201)
    const { permiso } = await res.json()

    expect(await eventoDe(res)).toMatchObject({
      accion: 'permiso_nominal.otorgar',
      rutaPlantilla: '/api/infraestructura/nominal/permisos',
      actorTipo: 'usuario',
      actorId: 'admin-1',
      objetoTipo: 'permiso_nominal',
      objetoId: permiso.id,
      resultado: 'exito',
      httpStatus: 201,
      metadatos: { permisoId: permiso.id },
    })
  })

  it('editor sin rol admin deja un evento rechazado y no otorga', async () => {
    sesionDePrueba.user = editor()
    const userId = `usuario-${randomUUID()}`

    const res = await POST(postReq({ userId, venceEn: venceEn() }))
    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ actorId: 'editor-1', resultado: 'rechazado', httpStatus: 403 })
    expect(await getDb().select().from(infraPermisoNominal).where(eq(infraPermisoNominal.userId, userId))).toHaveLength(0)
  })

  it('revocar deja un evento permiso_nominal.revocar con el admin que ejecuta', async () => {
    sesionDePrueba.user = admin()
    const userId = `usuario-${randomUUID()}`
    const otorgado = await POST(postReq({ userId, venceEn: venceEn() }))
    const { permiso } = await otorgado.json()

    const res = await DELETE(deleteReq(permiso.id))
    expect(res.status).toBe(200)
    expect(await eventoDe(res)).toMatchObject({
      accion: 'permiso_nominal.revocar',
      metodo: 'DELETE',
      actorTipo: 'usuario',
      actorId: 'admin-1',
      objetoTipo: 'permiso_nominal',
      objetoId: permiso.id,
      resultado: 'exito',
      httpStatus: 200,
      metadatos: { permisoId: permiso.id },
    })
    const [fila] = await getDb().select().from(infraPermisoNominal).where(eq(infraPermisoNominal.id, permiso.id))
    expect(fila?.revocadoEn).not.toBeNull()
  })

  it('si no se puede registrar la auditoría responde 503 y no otorga el permiso', async () => {
    sesionDePrueba.user = admin()
    const userId = `usuario-${randomUUID()}`

    const res = await conFalloAuditoria(() => POST(postReq({ userId, venceEn: venceEn() })))
    expect(res.status).toBe(503)
    expect(await getDb().select().from(infraPermisoNominal).where(eq(infraPermisoNominal.userId, userId))).toHaveLength(0)
  })
})
