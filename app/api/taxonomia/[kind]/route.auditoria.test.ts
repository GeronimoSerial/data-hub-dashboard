import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getDb } from '@/lib/db'
import { insertRecurso } from '@/lib/db/recursos'
import { auditoriaEvento, categorias, niveles, tipos } from '@/lib/db/schema'
import { parseRecursoBody } from '@/lib/recurso-write'
import { DELETE, POST } from './route'

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

usarDbTemporal('taxonomia-auditoria-')

beforeEach(() => {
  sesionDePrueba.user = null
})

const admin = () => ({ id: 'admin-1', role: 'admin', banned: false })
const editor = () => ({ id: 'editor-1', role: 'editor', banned: false })

function postReq(kind: string, body: unknown): Request {
  return new Request(`http://localhost/api/taxonomia/${kind}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function deleteReq(kind: string, id: string): Request {
  return new Request(`http://localhost/api/taxonomia/${kind}?id=${id}`, { method: 'DELETE' })
}

const ctx = (kind: string) => ({ params: Promise.resolve({ kind }) })

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

async function nivelExiste(id: string) {
  return (await getDb().select().from(niveles).where(eq(niveles.id, id))).length > 0
}

describe('auditoría de POST y DELETE /api/taxonomia/[kind]', () => {
  it('crear una entrada de taxonomía deja un evento taxonomia.crear del admin', async () => {
    sesionDePrueba.user = admin()
    const id = randomUUID()

    const res = await POST(postReq('niveles', { id, nombre: `Nivel ${id}`, orden: 1 }), ctx('niveles'))
    expect(res.status).toBe(200)
    expect(await eventoDe(res)).toMatchObject({
      accion: 'taxonomia.crear',
      metodo: 'POST',
      rutaPlantilla: '/api/taxonomia/[kind]',
      actorTipo: 'usuario',
      actorId: 'admin-1',
      objetoTipo: 'taxonomia',
      objetoId: 'niveles',
      resultado: 'exito',
      httpStatus: 200,
    })
    expect(await nivelExiste(id)).toBe(true)
  })

  it('cuerpo inválido deja un evento invalido y no guarda nada', async () => {
    sesionDePrueba.user = admin()
    const id = randomUUID()

    const res = await POST(postReq('niveles', { id, orden: 1 }), ctx('niveles'))
    expect(res.status).toBe(400)
    expect(await eventoDe(res)).toMatchObject({ accion: 'taxonomia.crear', resultado: 'invalido', httpStatus: 400 })
    expect(await nivelExiste(id)).toBe(false)
  })

  it('tipo de taxonomía inexistente deja un evento invalido', async () => {
    sesionDePrueba.user = admin()

    const res = await POST(postReq('inventada', { id: randomUUID(), nombre: 'X' }), ctx('inventada'))
    expect(res.status).toBe(400)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'invalido', httpStatus: 400 })
  })

  it('editor sin rol admin deja un evento rechazado y no guarda', async () => {
    sesionDePrueba.user = editor()
    const id = randomUUID()

    const res = await POST(postReq('niveles', { id, nombre: `Editor ${id}`, orden: 1 }), ctx('niveles'))
    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ actorId: 'editor-1', resultado: 'rechazado', httpStatus: 403 })
    expect(await nivelExiste(id)).toBe(false)
  })

  it('si no se puede registrar la auditoría al crear responde 503 y no guarda', async () => {
    sesionDePrueba.user = admin()
    const id = randomUUID()

    const res = await conFalloAuditoria(() => POST(postReq('niveles', { id, nombre: `Fallo ${id}`, orden: 1 }), ctx('niveles')))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await nivelExiste(id)).toBe(false)
  })

  it('eliminar una entrada sin uso deja un evento taxonomia.eliminar del admin', async () => {
    sesionDePrueba.user = admin()
    const id = randomUUID()
    await getDb().insert(niveles).values({ id, nombre: `Borrable ${id}`, orden: 0 })

    const res = await DELETE(deleteReq('niveles', id), ctx('niveles'))
    expect(res.status).toBe(200)
    expect(await eventoDe(res)).toMatchObject({
      accion: 'taxonomia.eliminar',
      metodo: 'DELETE',
      actorId: 'admin-1',
      objetoTipo: 'taxonomia',
      objetoId: 'niveles',
      resultado: 'exito',
      httpStatus: 200,
    })
    expect(await nivelExiste(id)).toBe(false)
  })

  it('eliminar una entrada en uso deja un evento invalido y la conserva', async () => {
    sesionDePrueba.user = admin()
    const id = randomUUID()
    await getDb().insert(niveles).values({ id, nombre: `En uso ${id}`, orden: 0 })
    const [tipo] = await getDb().select().from(tipos).limit(1)
    const [categoria] = await getDb().select().from(categorias).limit(1)
    await insertRecurso(parseRecursoBody({
      id: randomUUID(), titulo: 'Usa el nivel', descripcion: 'd', formato: 'reporte', nivelId: id,
      tipoId: tipo!.id, categoriaId: categoria!.id, tagIds: [], area: 'general', actualizado: '2026-11-13', estado: 'borrador',
    })!)

    const res = await DELETE(deleteReq('niveles', id), ctx('niveles'))
    expect(res.status).toBe(400)
    expect(await eventoDe(res)).toMatchObject({ accion: 'taxonomia.eliminar', resultado: 'invalido', httpStatus: 400 })
    expect(await nivelExiste(id)).toBe(true)
  })

  it('editor sin rol admin al eliminar deja un evento rechazado', async () => {
    sesionDePrueba.user = editor()
    const id = randomUUID()
    await getDb().insert(niveles).values({ id, nombre: `Protegido ${id}`, orden: 0 })

    const res = await DELETE(deleteReq('niveles', id), ctx('niveles'))
    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'rechazado', httpStatus: 403 })
    expect(await nivelExiste(id)).toBe(true)
  })

  it('si no se puede registrar la auditoría al eliminar responde 503 y la entrada sigue', async () => {
    sesionDePrueba.user = admin()
    const id = randomUUID()
    await getDb().insert(niveles).values({ id, nombre: `Sigue ${id}`, orden: 0 })

    const res = await conFalloAuditoria(() => DELETE(deleteReq('niveles', id), ctx('niveles')))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await nivelExiste(id)).toBe(true)
  })

  it('el evento no guarda el nombre de la entrada', async () => {
    sesionDePrueba.user = admin()
    const id = randomUUID()
    const nombre = `Nombre secreto ${id}`

    const res = await POST(postReq('niveles', { id, nombre, orden: 1 }), ctx('niveles'))
    expect(JSON.stringify(await eventoDe(res))).not.toContain(nombre)
  })
})

