import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento, infraVeredictoEnlace } from '@/lib/db/schema'
import { DELETE, POST } from './route'

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

usarDbTemporal('enlaces-veredicto-auditoria-')

beforeEach(() => {
  sesionDePrueba.user = null
})

const admin = () => ({ id: 'admin-1', role: 'admin', banned: false })

function postReq(body: unknown): Request {
  return new Request('http://localhost/api/infraestructura/veredictos/enlaces', {
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

describe('auditoría de enlaces del veredicto', () => {
  it('crear un enlace deja un evento enlace.crear sin token ni URL en la auditoría', async () => {
    sesionDePrueba.user = admin()

    const res = await POST(postReq({ desde: '2026-01-05', hasta: '2026-01-05' }))
    expect(res.status).toBe(201)
    const { url } = await res.json()
    const token = String(url).split('/').pop()!
    expect(token.length).toBeGreaterThan(0)

    const evento = await eventoDe(res)
    expect(evento).toMatchObject({
      accion: 'enlace.crear',
      rutaPlantilla: '/api/infraestructura/veredictos/enlaces',
      actorTipo: 'usuario',
      actorId: 'admin-1',
      objetoTipo: 'enlace_veredicto',
      resultado: 'exito',
      httpStatus: 201,
    })
    expect(evento.objetoId).toBeTruthy()
    expect(evento.metadatos).toMatchObject({ enlaceId: evento.objetoId })
    const serializado = JSON.stringify(evento)
    expect(serializado).not.toContain(token)
    expect(serializado).not.toContain('/veredicto/compartido/')
  })

  it('rango inválido deja un evento invalido y no crea enlace', async () => {
    sesionDePrueba.user = admin()
    const antes = await getDb().select().from(infraVeredictoEnlace)

    const res = await POST(postReq({ desde: '2026-01-06', hasta: '2026-01-05' }))
    expect(res.status).toBe(400)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'invalido', httpStatus: 400 })
    expect(await getDb().select().from(infraVeredictoEnlace)).toHaveLength(antes.length)
  })

  it('revocar enlaces del día deja un evento enlace.revocar con la cantidad', async () => {
    sesionDePrueba.user = admin()
    await POST(postReq({ desde: '2026-01-05', hasta: '2026-01-05' }))

    const res = await DELETE(new Request('http://localhost/api/infraestructura/veredictos/enlaces', { method: 'DELETE' }))
    expect(res.status).toBe(200)
    const evento = await eventoDe(res)
    expect(evento).toMatchObject({
      accion: 'enlace.revocar',
      metodo: 'DELETE',
      actorTipo: 'usuario',
      actorId: 'admin-1',
      objetoTipo: 'enlace_veredicto',
      resultado: 'exito',
      httpStatus: 200,
    })
    expect(typeof evento.metadatos.cantidad).toBe('number')
  })

  it('si no se puede registrar la auditoría responde 503 y no crea el enlace', async () => {
    sesionDePrueba.user = admin()
    const antes = await getDb().select().from(infraVeredictoEnlace)

    const res = await conFalloAuditoria(() => POST(postReq({ desde: '2026-01-07', hasta: '2026-01-07' })))
    expect(res.status).toBe(503)
    expect(await getDb().select().from(infraVeredictoEnlace)).toHaveLength(antes.length)
  })
})
