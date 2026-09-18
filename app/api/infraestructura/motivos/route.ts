import { asc, count, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraMotivo, infraProblematica } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { esCategoria } from '@/lib/infraestructura/categorias'
import { getSessionUser, staffGuard } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ABM propio de motivos de infraestructura: a propósito no vive en
// /api/taxonomia/[kind] (ver spec de diseño §3). Esa familia pertenece al
// dominio de recursos — su taxonomyInUseCount cuenta exclusivamente contra
// `recursos` — y meter infraestructura ahí rompería el límite del módulo.
function adminDenied(user: Awaited<ReturnType<typeof getSessionUser>>) {
  const denied = staffGuard(user)
  if (denied) return denied
  if (user!.role !== 'admin') {
    return { status: 403 as const, error: 'No tenés acceso a este recurso' }
  }
  return null
}

async function readId(request: Request) {
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

export async function GET() {
  await ensureSeeded()
  const denied = staffGuard(await getSessionUser())
  if (denied) return Response.json({ error: denied.error }, { status: denied.status })

  const db = getDb()
  const motivos = await db
    .select()
    .from(infraMotivo)
    .orderBy(asc(infraMotivo.categoria), asc(infraMotivo.orden), asc(infraMotivo.nombre))

  return Response.json({ motivos })
}

export async function POST(request: Request) {
  await ensureSeeded()
  const denied = adminDenied(await getSessionUser())
  if (denied) return Response.json({ error: denied.error }, { status: denied.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }
  const b = body as Record<string, unknown>

  if (typeof b.id !== 'string' || !b.id.trim()) {
    return Response.json({ error: 'id requerido' }, { status: 400 })
  }
  if (typeof b.nombre !== 'string' || !b.nombre.trim()) {
    return Response.json({ error: 'Nombre requerido' }, { status: 400 })
  }
  if (typeof b.categoria !== 'string' || !esCategoria(b.categoria)) {
    return Response.json({ error: 'Categoría inválida' }, { status: 400 })
  }

  const row = {
    id: b.id,
    nombre: b.nombre,
    categoria: b.categoria,
    orden: Number(b.orden) || 0,
  }

  const db = getDb()

  // El nombre es único en toda la tabla, no por categoría: resolverCategoria
  // deduce la categoría a partir del nombre guardado en infra_problematica
  // (ver el invariante en motivos.ts). La base también lo impone con un índice
  // único; se chequea acá para devolver un mensaje entendible en vez de que
  // estalle la restricción.
  const existente = await db
    .select({ id: infraMotivo.id })
    .from(infraMotivo)
    .where(eq(infraMotivo.nombre, row.nombre))
  if (existente.some((m) => m.id !== row.id)) {
    return Response.json(
      { error: 'Ya existe un motivo con ese nombre' },
      { status: 400 },
    )
  }

  await db
    .insert(infraMotivo)
    .values(row)
    .onConflictDoUpdate({
      target: infraMotivo.id,
      set: { nombre: row.nombre, categoria: row.categoria, orden: row.orden },
    })

  return Response.json({ ok: true })
}

export async function DELETE(request: Request) {
  await ensureSeeded()
  const denied = adminDenied(await getSessionUser())
  if (denied) return Response.json({ error: denied.error }, { status: denied.status })

  const id = await readId(request)
  if (!id) {
    return Response.json({ error: 'id requerido' }, { status: 400 })
  }

  const db = getDb()
  const [motivo] = await db.select().from(infraMotivo).where(eq(infraMotivo.id, id)).limit(1)
  if (!motivo) {
    return Response.json({ error: 'Motivo inexistente' }, { status: 400 })
  }

  const [{ n }] = await db
    .select({ n: count() })
    .from(infraProblematica)
    .where(eq(infraProblematica.motivo, motivo.nombre))
  if (n > 0) {
    return Response.json(
      { error: 'No se puede eliminar: hay problemáticas asociadas' },
      { status: 400 },
    )
  }

  await db.delete(infraMotivo).where(eq(infraMotivo.id, id))
  return Response.json({ ok: true })
}
