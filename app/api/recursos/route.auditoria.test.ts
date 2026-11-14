import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { auditoriaEvento, categorias, niveles, recursos, tipos } from '@/lib/db/schema'
import { POST } from './route'

vi.mock('@/lib/session', async () => {
  const { observarUsuarioAuditoria } = await import('@/lib/infraestructura/auditoria/contexto')
  return {
    getSessionUser: vi.fn(async () => {
      const user = sesionDePrueba.user
      observarUsuarioAuditoria(user)
      return user
    }),
    staffGuard: (user: { role: string } | null) => {
      if (!user) return { status: 401 as const, error: 'No autenticado' }
      if (user.role === 'consulta') return { status: 403 as const, error: 'No tiene acceso a este recurso' }
      return null
    },
  }
})

const sesionDePrueba: { user: { id: string; role: string; banned: boolean } | null } = { user: null }

usarDbTemporal('recursos-crear-auditoria-')

beforeEach(() => {
  sesionDePrueba.user = null
})

const admin = () => ({ id: 'admin-1', role: 'admin', banned: false })
const consulta = () => ({ id: 'lector-1', role: 'consulta', banned: false })

async function referencias() {
  const db = getDb()
  const [nivel] = await db.select().from(niveles).limit(1)
  const [tipo] = await db.select().from(tipos).limit(1)
  const [categoria] = await db.select().from(categorias).limit(1)
  return { nivelId: nivel!.id, tipoId: tipo!.id, categoriaId: categoria!.id }
}

async function cuerpo(extra: Record<string, unknown> = {}) {
  const id = randomUUID()
  return {
    id,
    titulo: `Recurso ${id}`,
    descripcion: `Descripción privada ${id}`,
    formato: 'reporte',
    ...(await referencias()),
    tagIds: [],
    area: 'general',
    actualizado: '2026-11-13',
    estado: 'borrador',
    ...extra,
  }
}

function postReq(body: unknown): Request {
  return new Request('http://localhost/api/recursos', {
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

async function existe(id: string) {
  return (await getDb().select().from(recursos).where(eq(recursos.id, id))).length > 0
}

describe('auditoría de POST /api/recursos', () => {
  it('crear un recurso deja un evento recurso.crear del admin', async () => {
    sesionDePrueba.user = admin()
    const body = await cuerpo()

    const res = await POST(postReq(body))
    expect(res.status).toBe(201)

    expect(await eventoDe(res)).toMatchObject({
      accion: 'recurso.crear',
      metodo: 'POST',
      rutaPlantilla: '/api/recursos',
      actorTipo: 'usuario',
      actorId: 'admin-1',
      objetoTipo: 'recurso',
      objetoId: body.id,
      resultado: 'exito',
      httpStatus: 201,
    })
    expect(await existe(body.id)).toBe(true)
  })

  it('cuerpo inválido deja un evento invalido y no guarda nada', async () => {
    sesionDePrueba.user = admin()
    const body = await cuerpo({ titulo: 42 })

    const res = await POST(postReq(body))
    expect(res.status).toBe(400)
    expect(await eventoDe(res)).toMatchObject({ accion: 'recurso.crear', resultado: 'invalido', httpStatus: 400 })
    expect(await existe(body.id)).toBe(false)
  })

  it('rol sin permiso de staff deja un evento rechazado y no guarda', async () => {
    sesionDePrueba.user = consulta()
    const body = await cuerpo()

    const res = await POST(postReq(body))
    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ actorId: 'lector-1', resultado: 'rechazado', httpStatus: 403 })
    expect(await existe(body.id)).toBe(false)
  })

  it('si no se puede registrar la auditoría responde 503 y el recurso no se guarda', async () => {
    sesionDePrueba.user = admin()
    const body = await cuerpo()

    const res = await conFalloAuditoria(() => POST(postReq(body)))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await existe(body.id)).toBe(false)
  })

  it('el evento no guarda título, descripción ni cuerpo completo', async () => {
    sesionDePrueba.user = admin()
    const body = await cuerpo()

    const res = await POST(postReq(body))
    const evento = await eventoDe(res)
    const guardado = JSON.stringify(evento)
    expect(guardado).not.toContain(body.titulo)
    expect(guardado).not.toContain(body.descripcion)
  })
})
