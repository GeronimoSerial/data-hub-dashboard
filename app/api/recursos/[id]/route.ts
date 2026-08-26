import { deleteRecurso, updateRecurso } from '@/lib/db/recursos'
import { ensureSeeded } from '@/lib/db/seed'
import {
  parseRecursoBody,
  rutaStorageKeyConflict,
} from '@/lib/recurso-write'
import { getSessionUser, staffGuard } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function PUT(request: Request, ctx: Ctx) {
  await ensureSeeded()
  const denied = staffGuard(await getSessionUser())
  if (denied) {
    return Response.json({ error: denied.error }, { status: denied.status })
  }

  const { id } = await ctx.params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const parsed = parseRecursoBody(body)
  if (!parsed) {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }
  const recurso = { ...parsed, id }
  if (rutaStorageKeyConflict(recurso.ruta, recurso.storageKey)) {
    return Response.json(
      { error: 'ruta y storageKey no pueden usarse juntos' },
      { status: 400 },
    )
  }

  try {
    const updated = await updateRecurso(recurso)
    if (!updated) {
      return Response.json({ error: 'Recurso no encontrado' }, { status: 404 })
    }
  } catch {
    return Response.json({ error: 'No se pudo guardar el recurso' }, { status: 400 })
  }
  return Response.json({ ok: true, id })
}

export async function DELETE(_request: Request, ctx: Ctx) {
  await ensureSeeded()
  const denied = staffGuard(await getSessionUser())
  if (denied) {
    return Response.json({ error: denied.error }, { status: denied.status })
  }

  const { id } = await ctx.params
  const deleted = await deleteRecurso(id)
  if (!deleted) {
    return Response.json({ error: 'Recurso no encontrado' }, { status: 404 })
  }
  return Response.json({ ok: true, id })
}
