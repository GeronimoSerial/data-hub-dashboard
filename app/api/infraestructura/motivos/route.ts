import { asc, count, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraAfectacion, infraMotivo } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import { esCategoria } from '@/lib/infraestructura/categorias'
import { esSeveridad } from '@/lib/infraestructura/validacion'
import { jsonError } from '@/lib/infraestructura/respuesta-error'
import { cambioAuditado, conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
import { getSessionUser, staffGuard } from '@/lib/session'
import { ruta } from '@/lib/http/ruta'

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
    return { status: 403 as const, error: 'No tiene acceso a este recurso' }
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

async function handleGET() {
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

async function handlePOST(request: Request) {
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

  const sugeridaCruda = b.severidadSugerida ?? null
  if (sugeridaCruda !== null && !esSeveridad(sugeridaCruda)) {
    return Response.json({ error: 'Gravedad sugerida inválida' }, { status: 400 })
  }

  const row = {
    id: b.id,
    nombre: b.nombre,
    categoria: b.categoria,
    orden: Number(b.orden) || 0,
    severidadSugerida: sugeridaCruda,
  }

  const db = getDb()

  // El nombre es único en toda la tabla, no por categoría: resolverCategoria
  // deduce la categoría a partir del nombre guardado en infra_afectacion
  // (ver el invariante en motivos.ts). La base también lo impone con un índice
  // único; se chequea acá para devolver un mensaje entendible en vez de que
  // estalle la restricción.
  const existente = await db
    .select({ id: infraMotivo.id })
    .from(infraMotivo)
    .where(eq(infraMotivo.nombre, row.nombre))
  if (existente.some((m) => m.id !== row.id)) {
    return jsonError('Ya existe un motivo con ese nombre', 400)
  }

  await cambioAuditado(
    async tx => {
      await tx
        .insert(infraMotivo)
        .values(row)
        .onConflictDoUpdate({
          target: infraMotivo.id,
          set: {
            nombre: row.nombre,
            categoria: row.categoria,
            orden: row.orden,
            severidadSugerida: row.severidadSugerida,
          },
        })
    },
    () => ({ status: 200, objetoTipo: 'motivo', objetoId: row.id }),
  )

  return Response.json({ ok: true })
}

async function handleDELETE(request: Request) {
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

  // F4.2: el guard de uso se repuntó del modelo deprecado (retirado en la
  // Fase 4) a infra_afectacion, que es donde hoy se persiste el nombre
  // del motivo en el modelo de parte. Sin este conteo, borrar un motivo en
  // uso dejaría afectaciones huérfanas sin forma de mostrarse en el ABM.
  const [{ n }] = await db
    .select({ n: count() })
    .from(infraAfectacion)
    .where(eq(infraAfectacion.motivo, motivo.nombre))
  if (n > 0) {
    return jsonError('No se puede eliminar: hay afectaciones que usan este motivo', 400)
  }

  await cambioAuditado(
    async tx => {
      await tx.delete(infraMotivo).where(eq(infraMotivo.id, id))
    },
    () => ({ status: 200, objetoTipo: 'motivo', objetoId: id }),
  )
  return Response.json({ ok: true })
}

export const GET = ruta('infraestructura.motivos.get', handleGET)
export const POST = conAuditoria('motivo.guardar', '/api/infraestructura/motivos', ruta('infraestructura.motivos.post', handlePOST))
export const DELETE = conAuditoria('motivo.eliminar', '/api/infraestructura/motivos', ruta('infraestructura.motivos.delete', handleDELETE))
