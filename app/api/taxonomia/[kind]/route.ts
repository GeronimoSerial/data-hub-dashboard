import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  categorias,
  niveles,
  tags,
  tipos,
} from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { jsonError } from '@/lib/infraestructura/respuesta-error'
import { getSessionUser, staffGuard } from '@/lib/session'
import type { Formato } from '@/lib/model'
import {
  isTaxonomyKind,
  taxonomyInUseCount,
  type TaxonomyKind,
} from '@/lib/taxonomia'
import { ruta } from '@/lib/http/ruta'
import { cambioAuditado, conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
import { describirAuditoria } from '@/lib/infraestructura/auditoria/contexto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ kind: string }> }

function adminDenied(user: Awaited<ReturnType<typeof getSessionUser>>) {
  const denied = staffGuard(user)
  if (denied) return denied
  if (user!.role !== 'admin') {
    return { status: 403 as const, error: 'No tiene acceso a este recurso' }
  }
  return null
}

async function readDeleteId(request: Request) {
  const fromQuery = new URL(request.url).searchParams.get('id')
  if (fromQuery) return fromQuery
  try {
    const body = (await request.json()) as { id?: unknown }
    if (typeof body?.id === 'string' && body.id) return body.id
  } catch {
    return null
  }
  return null
}

async function handlePOST(request: Request, ctx: Ctx) {
  await ensureSeeded()
  const denied = adminDenied(await getSessionUser())
  if (denied) {
    return Response.json({ error: denied.error }, { status: denied.status })
  }

  const { kind } = await ctx.params
  if (!isTaxonomyKind(kind)) {
    return Response.json({ error: 'kind inválido' }, { status: 400 })
  }
  describirAuditoria({ objetoTipo: 'taxonomia', objetoId: kind })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  try {
    await cambioAuditado(
      () => upsertKind(kind, body),
      () => ({ status: 200, objetoTipo: 'taxonomia', objetoId: kind }),
    )
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }
  return Response.json({ ok: true })
}

async function handleDELETE(request: Request, ctx: Ctx) {
  await ensureSeeded()
  const denied = adminDenied(await getSessionUser())
  if (denied) {
    return Response.json({ error: denied.error }, { status: denied.status })
  }

  const { kind } = await ctx.params
  if (!isTaxonomyKind(kind)) {
    return Response.json({ error: 'kind inválido' }, { status: 400 })
  }

  const id = await readDeleteId(request)
  if (!id) {
    return Response.json({ error: 'id requerido' }, { status: 400 })
  }

  const uses = await taxonomyInUseCount(kind, id)
  if (uses > 0) {
    return jsonError('No se puede eliminar: hay recursos asociados', 400)
  }

  try {
    await cambioAuditado(
      async tx => {
        if (kind === 'niveles') await tx.delete(niveles).where(eq(niveles.id, id))
        else if (kind === 'tipos') await tx.delete(tipos).where(eq(tipos.id, id))
        else if (kind === 'categorias')
          await tx.delete(categorias).where(eq(categorias.id, id))
        else await tx.delete(tags).where(eq(tags.id, id))
      },
      () => ({ status: 200, objetoTipo: 'taxonomia', objetoId: kind }),
    )
  } catch {
    return jsonError('No se puede eliminar: hay recursos asociados', 400)
  }

  return Response.json({ ok: true })
}

async function upsertKind(kind: TaxonomyKind, body: unknown) {
  if (!body || typeof body !== 'object') throw new Error('invalid')
  const b = body as Record<string, unknown>
  if (typeof b.id !== 'string' || !b.id.trim()) throw new Error('invalid')
  if (typeof b.nombre !== 'string') throw new Error('invalid')

  const db = getDb()
  if (kind === 'niveles') {
    const row = {
      id: b.id,
      nombre: b.nombre,
      orden: Number(b.orden) || 0,
    }
    await db
      .insert(niveles)
      .values(row)
      .onConflictDoUpdate({
        target: niveles.id,
        set: { nombre: row.nombre, orden: row.orden },
      })
    return
  }
  if (kind === 'tipos') {
    const aplicaA = Array.isArray(b.aplicaA)
      ? (b.aplicaA.filter((f): f is Formato =>
          f === 'reporte' || f === 'tablero' || f === 'mapa',
        ) as Formato[])
      : []
    if (aplicaA.length === 0) throw new Error('invalid')
    const row = { id: b.id, nombre: b.nombre, aplicaA }
    await db
      .insert(tipos)
      .values(row)
      .onConflictDoUpdate({
        target: tipos.id,
        set: { nombre: row.nombre, aplicaA: row.aplicaA },
      })
    return
  }
  if (kind === 'categorias') {
    if (typeof b.color !== 'string') throw new Error('invalid')
    const row = { id: b.id, nombre: b.nombre, color: b.color }
    await db
      .insert(categorias)
      .values(row)
      .onConflictDoUpdate({
        target: categorias.id,
        set: { nombre: row.nombre, color: row.color },
      })
    return
  }
  const row = { id: b.id, nombre: b.nombre }
  await db
    .insert(tags)
    .values(row)
    .onConflictDoUpdate({
      target: tags.id,
      set: { nombre: row.nombre },
    })
}

export const POST = conAuditoria('taxonomia.crear', '/api/taxonomia/[kind]', ruta('taxonomia.kind.post', handlePOST))
export const DELETE = conAuditoria('taxonomia.eliminar', '/api/taxonomia/[kind]', ruta('taxonomia.kind.delete', handleDELETE))
