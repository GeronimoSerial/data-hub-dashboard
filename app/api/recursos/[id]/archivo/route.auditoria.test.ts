import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usarDbTemporal } from '@/lib/test-utils/db-temporal'
import { conFalloAuditoria } from '@/lib/test-utils/fallo-auditoria'
import { getUploadsDir } from '@/lib/data-dir'
import { getDb } from '@/lib/db'
import { insertRecurso } from '@/lib/db/recursos'
import { auditoriaEvento, categorias, niveles, recursos, tipos } from '@/lib/db/schema'
import { parseRecursoBody } from '@/lib/recurso-write'
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

usarDbTemporal('recursos-archivo-auditoria-')

beforeEach(() => {
  sesionDePrueba.user = null
})

const admin = () => ({ id: 'admin-1', role: 'admin', banned: false })
const consulta = () => ({ id: 'lector-1', role: 'consulta', banned: false })
const NOMBRE_ARCHIVO = 'informe-privado-ñ.pdf'

async function crearRecurso() {
  const db = getDb()
  const [nivel] = await db.select().from(niveles).limit(1)
  const [tipo] = await db.select().from(tipos).limit(1)
  const [categoria] = await db.select().from(categorias).limit(1)
  const id = randomUUID()
  await insertRecurso(parseRecursoBody({
    id,
    titulo: `Recurso ${id}`,
    descripcion: 'Descripción',
    formato: 'reporte',
    nivelId: nivel!.id,
    tipoId: tipo!.id,
    categoriaId: categoria!.id,
    tagIds: [],
    area: 'general',
    actualizado: '2026-11-13',
    estado: 'borrador',
  })!)
  return id
}

function subidaReq(id: string, archivo: File | null = new File([Buffer.from('%PDF-1.4 contenido')], NOMBRE_ARCHIVO, { type: 'application/pdf' })): Request {
  const form = new FormData()
  if (archivo) form.append('file', archivo)
  return new Request(`http://localhost/api/recursos/${id}/archivo`, { method: 'POST', body: form })
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) })

async function eventoDe(res: Response) {
  const requestId = res.headers.get('X-Audit-Id') ?? res.headers.get('X-Request-Id')
  expect(requestId).toBeTruthy()
  const filas = await getDb().select().from(auditoriaEvento).where(eq(auditoriaEvento.requestId, requestId!))
  expect(filas).toHaveLength(1)
  return filas[0]!
}

async function storageKeyDe(id: string) {
  const [fila] = await getDb().select({ storageKey: recursos.storageKey }).from(recursos).where(eq(recursos.id, id))
  return fila?.storageKey ?? null
}

function archivosDe(id: string) {
  const dir = path.join(getUploadsDir(), id)
  return existsSync(dir) ? readdirSync(dir) : []
}

describe('auditoría de POST /api/recursos/[id]/archivo', () => {
  it('subir un archivo deja un evento recurso.archivo con formato y tamaño', async () => {
    sesionDePrueba.user = admin()
    const id = await crearRecurso()

    const res = await POST(subidaReq(id), ctx(id))
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(await storageKeyDe(id)).toBe(body.storageKey)
    expect(await eventoDe(res)).toBeDefined()
  })

  it('el evento de subida registra la acción, el objeto y los metadatos permitidos', async () => {
    sesionDePrueba.user = admin()
    const id = await crearRecurso()

    const res = await POST(subidaReq(id), ctx(id))
    expect(await eventoDe(res)).toMatchObject({
      accion: 'recurso.archivo',
      metodo: 'POST',
      rutaPlantilla: '/api/recursos/[id]/archivo',
      actorTipo: 'usuario',
      actorId: 'admin-1',
      objetoTipo: 'recurso',
      objetoId: id,
      resultado: 'exito',
      httpStatus: 200,
      metadatos: { formato: 'pdf', cantidad: '%PDF-1.4 contenido'.length },
    })
  })

  it('sin archivo deja un evento invalido y no cambia el recurso', async () => {
    sesionDePrueba.user = admin()
    const id = await crearRecurso()

    const res = await POST(subidaReq(id, null), ctx(id))
    expect(res.status).toBe(400)
    expect(await eventoDe(res)).toMatchObject({ accion: 'recurso.archivo', resultado: 'invalido', httpStatus: 400 })
    expect(await storageKeyDe(id)).toBeNull()
  })

  it('recurso inexistente deja un evento invalido', async () => {
    sesionDePrueba.user = admin()
    const id = randomUUID()

    const res = await POST(subidaReq(id), ctx(id))
    expect(res.status).toBe(404)
    expect(await eventoDe(res)).toMatchObject({ resultado: 'invalido', httpStatus: 404 })
  })

  it('rol sin permiso de staff deja un evento rechazado y no sube nada', async () => {
    sesionDePrueba.user = consulta()
    const id = await crearRecurso()

    const res = await POST(subidaReq(id), ctx(id))
    expect(res.status).toBe(403)
    expect(await eventoDe(res)).toMatchObject({ actorId: 'lector-1', resultado: 'rechazado', httpStatus: 403 })
    expect(await storageKeyDe(id)).toBeNull()
    expect(archivosDe(id)).toEqual([])
  })

  it('si no se puede registrar la auditoría responde 503, no guarda la clave y no deja el archivo', async () => {
    sesionDePrueba.user = admin()
    const id = await crearRecurso()

    const res = await conFalloAuditoria(() => POST(subidaReq(id), ctx(id)))
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: 'auditoria_no_disponible' })
    expect(await storageKeyDe(id)).toBeNull()
    expect(archivosDe(id)).toEqual([])
  })

  it('el evento no guarda nombre de archivo, clave de almacenamiento ni contenido', async () => {
    sesionDePrueba.user = admin()
    const id = await crearRecurso()

    const res = await POST(subidaReq(id), ctx(id))
    const body = await res.json() as { storageKey: string }
    const fileId = body.storageKey.split('/')[1]!
    const guardado = JSON.stringify(await eventoDe(res))
    expect(guardado).not.toContain(NOMBRE_ARCHIVO)
    expect(guardado).not.toContain(fileId)
    expect(guardado).not.toContain('%PDF-1.4')
  })
})
