import { insertRecurso } from '@/lib/db/recursos'
import { ensureSeeded } from '@/lib/db/seed'
import { jsonError } from '@/lib/infraestructura/respuesta-error'
import {
  parseRecursoBody,
  publicadoXorInvalid,
  rutaStorageKeyConflict,
} from '@/lib/recurso-write'
import { getSessionUser, staffGuard } from '@/lib/session'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handlePOST(request: Request) {
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
    return jsonError('ruta y storageKey no pueden usarse juntos', 400)
  }
  if (publicadoXorInvalid(recurso.estado, recurso.ruta, recurso.storageKey)) {
    return jsonError('Un recurso publicado necesita archivo o ruta', 400)
  }

  try {
    await insertRecurso(recurso)
  } catch {
    return Response.json({ error: 'No se pudo guardar el recurso' }, { status: 400 })
  }
  return Response.json({ ok: true, id: recurso.id }, { status: 201 })
}

export const POST = ruta('recursos.post', handlePOST)
