import { insertRecurso } from '@/lib/db/recursos'
import { ensureSeeded } from '@/lib/db/seed'
import {
  parseRecursoBody,
  rutaStorageKeyConflict,
} from '@/lib/recurso-write'
import { getSessionUser, staffGuard } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  await ensureSeeded()
  const denied = staffGuard(await getSessionUser())
  if (denied) {
    return Response.json({ error: denied.error }, { status: denied.status })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const recurso = parseRecursoBody(body)
  if (!recurso) {
    return Response.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }
  if (rutaStorageKeyConflict(recurso.ruta, recurso.storageKey)) {
    return Response.json(
      { error: 'ruta y storageKey no pueden usarse juntos' },
      { status: 400 },
    )
  }

  try {
    await insertRecurso(recurso)
  } catch {
    return Response.json({ error: 'No se pudo guardar el recurso' }, { status: 400 })
  }
  return Response.json({ ok: true, id: recurso.id }, { status: 201 })
}
