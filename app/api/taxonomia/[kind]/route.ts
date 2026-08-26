import { count, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import {
  categorias,
  niveles,
  recursoTags,
  recursos,
  tags,
  tipos,
} from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { getSessionUser, staffGuard } from '@/lib/session'
import type { Formato } from '@/lib/model'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const KINDS = ['niveles', 'tipos', 'categorias', 'tags'] as const
type Kind = (typeof KINDS)[number]

type Ctx = { params: Promise<{ kind: string }> }

function isKind(value: string): value is Kind {
  return (KINDS as readonly string[]).includes(value)
}

function adminDenied(user: Awaited<ReturnType<typeof getSessionUser>>) {
  const denied = staffGuard(user)
  if (denied) return denied
  if (user!.role !== 'admin') {
    return { status: 403 as const, error: 'No tenés acceso a este recurso' }
  }
  return null
}

async function inUse(kind: Kind, id: string) {
  const db = getDb()
  if (kind === 'niveles') {
    const [row] = await db
      .select({ n: count() })
      .from(recursos)
      .where(eq(recursos.nivelId, id))
    return row?.n ?? 0
  }
  if (kind === 'tipos') {
    const [row] = await db
      .select({ n: count() })
      .from(recursos)
      .where(eq(recursos.tipoId, id))
    return row?.n ?? 0
  }
  if (kind === 'categorias') {
    const [row] = await db
      .select({ n: count() })
      .from(recursos)
      .where(eq(recursos.categoriaId, id))
    return row?.n ?? 0
  }
  const [row] = await db
    .select({ n: count() })
    .from(recursoTags)
    .where(eq(recursoTags.tagId, id))
  return row?.n ?? 0
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

export async function POST(request: Request, ctx: Ctx) {
  await ensureSeeded()
  const denied = adminDenied(await getSessionUser())
  if (denied) {
    return Response.json({ error: denied.error }, { status: denied.status })
  }

  const { kind } = await ctx.params
  if (!isKind(kind)) {
    return Response.json({ error: 'kind inválido' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  try {
    await upsertKind(kind, body)
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }
  return Response.json({ ok: true })
}

export async function DELETE(request: Request, ctx: Ctx) {
  await ensureSeeded()
  const denied = adminDenied(await getSessionUser())
  if (denied) {
    return Response.json({ error: denied.error }, { status: denied.status })
  }

  const { kind } = await ctx.params
  if (!isKind(kind)) {
    return Response.json({ error: 'kind inválido' }, { status: 400 })
  }

  const id = await readDeleteId(request)
  if (!id) {
    return Response.json({ error: 'id requerido' }, { status: 400 })
  }

  const uses = await inUse(kind, id)
  if (uses > 0) {
    return Response.json(
      { error: 'No se puede eliminar: hay recursos asociados' },
      { status: 400 },
    )
  }

  const db = getDb()
  if (kind === 'niveles') await db.delete(niveles).where(eq(niveles.id, id))
  else if (kind === 'tipos') await db.delete(tipos).where(eq(tipos.id, id))
  else if (kind === 'categorias')
    await db.delete(categorias).where(eq(categorias.id, id))
  else await db.delete(tags).where(eq(tags.id, id))

  return Response.json({ ok: true })
}

async function upsertKind(kind: Kind, body: unknown) {
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
