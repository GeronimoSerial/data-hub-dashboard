import { desc, sql } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { infraProblematica, infraProblematicaSeccion } from '@/lib/db/schema'
import { normalizeCue } from '@/lib/infraestructura/cue'
import { getCorteVigente } from '@/lib/infraestructura/ge-db'
import { asegurarGeAdjuntada, calcularImpactoSecciones } from '@/lib/infraestructura/impacto'
import { listarMotivos } from '@/lib/infraestructura/motivos'
import { resolverCategoria } from '@/lib/infraestructura/validacion'
import { parseProblematicaAdminInput } from '@/lib/infraestructura/validacion-admin'
import { getSessionUser } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// A propósito no usa staffGuard: esta pantalla no es una pestaña de "recursos"
// del panel (ver isAdmin en components/admin-page.tsx), por lo que sólo un
// admin llega a verla. El guard de la API tiene que ser igual de estricto que
// esa visibilidad: si un editor pudiera pegarle a la ruta a mano, la API
// sería más permisiva que la pantalla que la ofrece.
function adminGuard(user: Awaited<ReturnType<typeof getSessionUser>>) {
  if (!user) return { status: 401 as const, error: 'No autenticado' }
  if (user.banned || user.role !== 'admin')
    return { status: 403 as const, error: 'No tenés acceso a este recurso' }
  return null
}

async function seccionesDelCue(
  client: Awaited<ReturnType<typeof getDb>>['$client'],
  corteId: number,
  cueAnexo: string,
): Promise<number[]> {
  const res = await client.execute({
    sql: 'SELECT ge_section_id FROM ge.ge_seccion WHERE corte_id = ? AND cue_anexo = ?',
    args: [corteId, cueAnexo],
  })
  return res.rows.map((r) => Number(r.ge_section_id))
}

export async function GET() {
  await ensureSeeded()
  const user = await getSessionUser()
  const guard = adminGuard(user)
  if (guard) return Response.json({ error: guard.error }, { status: guard.status })

  const db = getDb()
  const problematicas = await db
    .select()
    .from(infraProblematica)
    .orderBy(desc(infraProblematica.creadaEn))

  const cantidades = await db
    .select({
      problematicaId: infraProblematicaSeccion.problematicaId,
      cantidad: sql<number>`count(*)`,
    })
    .from(infraProblematicaSeccion)
    .groupBy(infraProblematicaSeccion.problematicaId)

  const cantidadPorId = new Map(cantidades.map((c) => [c.problematicaId, Number(c.cantidad)]))

  return Response.json({
    problematicas: problematicas.map((p) => ({
      ...p,
      seccionesCantidad: cantidadPorId.get(p.id) ?? 0,
    })),
  })
}

export async function POST(request: Request) {
  await ensureSeeded()
  const user = await getSessionUser()
  const guard = adminGuard(user)
  if (guard) return Response.json({ error: guard.error }, { status: guard.status })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const parsed = parseProblematicaAdminInput(body)
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 })
  }
  const input = parsed.data

  const cue = normalizeCue(input.cue)
  if (!cue) {
    return Response.json({ error: 'CUE inválido' }, { status: 400 })
  }

  // Misma integridad que el alta pública: la categoría la resuelve el
  // servidor a partir del motivo, nunca la decide el body (que acá ni
  // siquiera tiene ese campo).
  const motivos = await listarMotivos()
  const categoriaResuelta = resolverCategoria(input.motivo, motivos)
  if (!categoriaResuelta.ok) {
    return Response.json({ error: categoriaResuelta.error }, { status: 400 })
  }
  const categoria = categoriaResuelta.categoria

  const db = getDb()
  const client = db.$client
  await asegurarGeAdjuntada(client)

  const corte = await getCorteVigente(client)
  if (!corte) {
    return Response.json({ error: 'No hay un corte vigente de Gestión Educativa' }, { status: 503 })
  }

  const seccionesCue = new Set(await seccionesDelCue(client, corte.id, cue.value))
  const seccionesInvalidas = input.secciones.filter((s) => !seccionesCue.has(s))
  if (seccionesInvalidas.length > 0) {
    return Response.json(
      { error: 'Alguna de las secciones no pertenece al establecimiento indicado' },
      { status: 400 },
    )
  }

  const id = crypto.randomUUID()
  const creadaEn = new Date().toISOString()

  await db.transaction(async (tx) => {
    await tx.insert(infraProblematica).values({
      id,
      cueAnexo: cue.value,
      motivo: input.motivo,
      categoria,
      severidad: input.severidad,
      descripcion: input.descripcion ?? null,
      corteId: corte.id,
      creadaEn,
      // Sin equivalente de reintento anónimo: alcanza con una clave propia,
      // nunca repetida, para satisfacer el UNIQUE de la columna.
      idempotencyKey: `admin:${id}`,
      origen: 'admin',
    })
    await tx.insert(infraProblematicaSeccion).values(
      input.secciones.map((geSectionId) => ({ problematicaId: id, geSectionId })),
    )
  })

  const impacto = await calcularImpactoSecciones(client, {
    corteId: corte.id,
    geSectionIds: input.secciones,
  })

  return Response.json({ ok: true, id, impacto }, { status: 201 })
}
