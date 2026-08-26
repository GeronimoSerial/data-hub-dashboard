import { eq } from 'drizzle-orm'
import { unlinkStoredFile, storedKeyToUnlink } from '@/lib/archivo'
import { getDb } from '@/lib/db'
import { deleteRecurso, updateRecurso } from '@/lib/db/recursos'
import { recursos } from '@/lib/db/schema'
import { ensureSeeded } from '@/lib/db/seed'
import {
  parseRecursoBody,
  publicadoXorInvalid,
  rutaStorageKeyConflict,
} from '@/lib/recurso-write'
import { getSessionUser, staffGuard } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

async function existingStorageKey(id: string) {
  const [row] = await getDb()
    .select({ storageKey: recursos.storageKey })
    .from(recursos)
    .where(eq(recursos.id, id))
  return row?.storageKey ?? null
}

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

  const clearingFile = !parsed.storageKey?.trim()
  const previousKey = clearingFile ? await existingStorageKey(id) : null
  const recurso = clearingFile
    ? {
        ...parsed,
        id,
        storageKey: undefined,
        mime: undefined,
        nombreOriginal: undefined,
        size: undefined,
      }
    : { ...parsed, id }

  if (rutaStorageKeyConflict(recurso.ruta, recurso.storageKey)) {
    return Response.json(
      { error: 'ruta y storageKey no pueden usarse juntos' },
      { status: 400 },
    )
  }
  if (publicadoXorInvalid(recurso.estado, recurso.ruta, recurso.storageKey)) {
    return Response.json(
      { error: 'Un recurso publicado necesita archivo o ruta' },
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

  const toUnlink = storedKeyToUnlink(parsed.storageKey, previousKey)
  if (toUnlink) await unlinkStoredFile(toUnlink)
  return Response.json({ ok: true, id })
}

export async function DELETE(_request: Request, ctx: Ctx) {
  await ensureSeeded()
  const denied = staffGuard(await getSessionUser())
  if (denied) {
    return Response.json({ error: denied.error }, { status: denied.status })
  }

  const { id } = await ctx.params
  const previousKey = await existingStorageKey(id)
  const deleted = await deleteRecurso(id)
  if (!deleted) {
    return Response.json({ error: 'Recurso no encontrado' }, { status: 404 })
  }
  await unlinkStoredFile(previousKey)
  return Response.json({ ok: true, id })
}
