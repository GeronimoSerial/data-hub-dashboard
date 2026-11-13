import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ExplainResource from '@/lib/explain-resource'
import type * as ExplainProvider from '@/lib/explain-provider'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento, recursos } from '@/lib/db/schema'
import { POST } from './route'

const mocks = vi.hoisted(() => ({
  generateExplanation: vi.fn(),
  getCachedExplanation: vi.fn(),
}))

vi.mock('@/lib/explain-resource', async importOriginal => ({
  ...(await importOriginal<typeof ExplainResource>()),
  generateExplanation: mocks.generateExplanation,
  getCachedExplanation: mocks.getCachedExplanation,
}))

vi.mock('@/lib/explain-provider', async importOriginal => ({
  ...(await importOriginal<typeof ExplainProvider>()),
  getExplainProvider: () => ({}),
}))

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

const TODAS_LAS_SECCIONES = ['explore', 'reports', 'maps', 'dashboards', 'infrastructure', 'situation']
const sesionDePrueba: { user: ({ id: string; role: string } & Record<string, unknown>) | null } = { user: null }

usarDbTemporal('recursos-explain-auditoria-')

beforeEach(() => {
  vi.clearAllMocks()
  sesionDePrueba.user = { id: 'admin-1', role: 'admin', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [], hubPolicy: { enabledSections: TODAS_LAS_SECCIONES, landing: false } }
  mocks.getCachedExplanation.mockReturnValue(null)
  mocks.generateExplanation.mockResolvedValue({ explanation: 'Texto generado confidencial', cached: false, status: 'success' })
})

async function recursoPublicado() {
  const [fila] = await getDb().select({ id: recursos.id }).from(recursos).where(eq(recursos.estado, 'publicado')).limit(1)
  return fila!.id
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const req = (id: string) => new Request(`http://localhost/api/recursos/${id}/explain`, { method: 'POST' })

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

describe('auditoría de POST /api/recursos/[id]/explain', () => {
  it('pedir una explicación deja un evento recurso.explicar del usuario', async () => {
    const id = await recursoPublicado()

    const res = await POST(req(id), ctx(id))
    expect(res.status).toBe(200)
    expect(await eventoDe(res)).toMatchObject({
      accion: 'recurso.explicar',
      metodo: 'POST',
      rutaPlantilla: '/api/recursos/[id]/explain',
      actorTipo: 'usuario',
      actorId: 'admin-1',
      objetoTipo: 'recurso',
      objetoId: id,
      resultado: 'exito',
      httpStatus: 200,
    })
  })

  it('el evento no guarda la explicación generada', async () => {
    const id = await recursoPublicado()

    const res = await POST(req(id), ctx(id))
    expect(res.status).toBe(200)
    expect(JSON.stringify(await eventoDe(res))).not.toContain('Texto generado confidencial')
  })

  it('recurso inexistente deja un evento invalido sin llamar a la IA', async () => {
    const id = randomUUID()

    const res = await POST(req(id), ctx(id))
    expect(res.status).toBe(404)
    expect(await eventoDe(res)).toMatchObject({ accion: 'recurso.explicar', resultado: 'invalido', httpStatus: 404 })
    expect(mocks.generateExplanation).not.toHaveBeenCalled()
  })

  it('sin sesión deja un evento rechazado y no llama a la IA', async () => {
    sesionDePrueba.user = null
    const id = await recursoPublicado()

    const res = await POST(req(id), ctx(id))
    expect(res.status).toBe(401)
    expect(await eventoDe(res)).toMatchObject({ actorTipo: 'anonimo', resultado: 'rechazado', httpStatus: 401 })
    expect(mocks.generateExplanation).not.toHaveBeenCalled()
  })

  it('sección no habilitada deja un evento rechazado y no llama a la IA', async () => {
    sesionDePrueba.user = { id: 'lector-1', role: 'consulta', banned: false, nivelJurIds: [], accesoRecursos: 'todos', recursoIds: [], hubPolicy: { enabledSections: [], landing: false } }
    const id = await recursoPublicado()

    const res = await POST(req(id), ctx(id))
    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ actorId: 'lector-1', resultado: 'rechazado', httpStatus: 403 })
    expect(mocks.generateExplanation).not.toHaveBeenCalled()
  })

  it('si no se puede registrar la auditoría responde 503 con el código de auditoría', async () => {
    const id = await recursoPublicado()

    const res = await conFalloAuditoria(() => POST(req(id), ctx(id)))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
  })
})
