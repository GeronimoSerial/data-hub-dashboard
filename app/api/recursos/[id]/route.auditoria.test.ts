import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { insertRecurso } from '@/lib/db/recursos'
import { auditoriaEvento, categorias, niveles, recursos, tipos } from '@/lib/db/schema'
import { parseRecursoBody } from '@/lib/recurso-write'
import { DELETE, PUT } from './route'

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

usarDbTemporal('recursos-id-auditoria-')

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

async function cuerpo(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    titulo: `Titulo original ${id}`,
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

async function crearExistente() {
  const id = randomUUID()
  const body = await cuerpo(id)
  await insertRecurso(parseRecursoBody(body)!)
  return { id, body }
}

function putReq(id: string, body: unknown): Request {
  return new Request(`http://localhost/api/recursos/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function deleteReq(id: string): Request {
  return new Request(`http://localhost/api/recursos/${id}`, { method: 'DELETE' })
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

async function titulo(id: string) {
  const [fila] = await getDb().select({ titulo: recursos.titulo }).from(recursos).where(eq(recursos.id, id))
  return fila?.titulo ?? null
}

describe('auditoría de PUT y DELETE /api/recursos/[id]', () => {
  it('modificar un recurso deja un evento recurso.modificar del admin', async () => {
    sesionDePrueba.user = admin()
    const { id, body } = await crearExistente()

    const res = await PUT(putReq(id, { ...body, titulo: 'Titulo nuevo' }), ctx(id))
    expect(res.status).toBe(200)

    expect(await eventoDe(res)).toMatchObject({
      accion: 'recurso.modificar',
      metodo: 'PUT',
      rutaPlantilla: '/api/recursos/[id]',
      actorTipo: 'usuario',
      actorId: 'admin-1',
      objetoTipo: 'recurso',
      objetoId: id,
      resultado: 'exito',
      httpStatus: 200,
    })
    expect(await titulo(id)).toBe('Titulo nuevo')
  })

  it('modificar un recurso inexistente deja un evento invalido y no crea nada', async () => {
    sesionDePrueba.user = admin()
    const id = randomUUID()

    const res = await PUT(putReq(id, await cuerpo(id)), ctx(id))
    expect(res.status).toBe(404)
    expect(await eventoDe(res)).toMatchObject({ accion: 'recurso.modificar', resultado: 'invalido', httpStatus: 404 })
    expect(await titulo(id)).toBeNull()
  })

  it('cuerpo inválido deja un evento invalido y no cambia el recurso', async () => {
    sesionDePrueba.user = admin()
    const { id, body } = await crearExistente()

    const res = await PUT(putReq(id, { ...body, titulo: 7 }), ctx(id))
    expect(res.status).toBe(400)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'invalido', httpStatus: 400 })
    expect(await titulo(id)).toBe(body.titulo)
  })

  it('rol sin permiso de staff deja un evento rechazado y no modifica', async () => {
    sesionDePrueba.user = consulta()
    const { id, body } = await crearExistente()

    const res = await PUT(putReq(id, { ...body, titulo: 'Intento' }), ctx(id))
    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ actorId: 'lector-1', resultado: 'rechazado', httpStatus: 403 })
    expect(await titulo(id)).toBe(body.titulo)
  })

  it('si no se puede registrar la auditoría al modificar responde 503 y no cambia el título', async () => {
    sesionDePrueba.user = admin()
    const { id, body } = await crearExistente()

    const res = await conFalloAuditoria(() => PUT(putReq(id, { ...body, titulo: 'Sin auditoría' }), ctx(id)))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await titulo(id)).toBe(body.titulo)
  })

  it('eliminar un recurso deja un evento recurso.eliminar del admin', async () => {
    sesionDePrueba.user = admin()
    const { id } = await crearExistente()

    const res = await DELETE(deleteReq(id), ctx(id))
    expect(res.status).toBe(200)
    expect(await eventoDe(res)).toMatchObject({
      accion: 'recurso.eliminar',
      metodo: 'DELETE',
      actorId: 'admin-1',
      objetoTipo: 'recurso',
      objetoId: id,
      resultado: 'exito',
      httpStatus: 200,
    })
    expect(await titulo(id)).toBeNull()
  })

  it('eliminar un recurso inexistente deja un evento invalido', async () => {
    sesionDePrueba.user = admin()
    const id = randomUUID()

    const res = await DELETE(deleteReq(id), ctx(id))
    expect(res.status).toBe(404)
    expect(await eventoDe(res)).toMatchObject({ accion: 'recurso.eliminar', resultado: 'invalido', httpStatus: 404 })
  })

  it('rol sin permiso de staff al eliminar deja un evento rechazado y conserva el recurso', async () => {
    sesionDePrueba.user = consulta()
    const { id, body } = await crearExistente()

    const res = await DELETE(deleteReq(id), ctx(id))
    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'rechazado', httpStatus: 403 })
    expect(await titulo(id)).toBe(body.titulo)
  })

  it('si no se puede registrar la auditoría al eliminar responde 503 y el recurso sigue', async () => {
    sesionDePrueba.user = admin()
    const { id, body } = await crearExistente()

    const res = await conFalloAuditoria(() => DELETE(deleteReq(id), ctx(id)))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await titulo(id)).toBe(body.titulo)
  })

  it('el evento de modificación no guarda título ni descripción', async () => {
    sesionDePrueba.user = admin()
    const { id, body } = await crearExistente()

    const res = await PUT(putReq(id, { ...body, titulo: 'Titulo secreto nuevo', descripcion: 'Texto secreto' }), ctx(id))
    const guardado = JSON.stringify(await eventoDe(res))
    expect(guardado).not.toContain('Titulo secreto nuevo')
    expect(guardado).not.toContain('Texto secreto')
    expect(guardado).not.toContain(body.titulo)
  })
})

