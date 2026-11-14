import { migrarDb } from '@/lib/db'
import { consultaAuditoriaSchema, consultarAuditoria } from '@/lib/infraestructura/auditoria/consulta'
import { getSessionUser } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

// Leer el visor NO genera evento de auditoría: un evento por página haría que el
// rendimiento del visor dependa de su propia escritura y no es un cambio de datos.
// Por eso esta ruta no usa conAuditoria; el coverage test solo escanea métodos mutadores.
function adminDenied(user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>>) {
  return user.banned || user.role !== 'admin'
}

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401, headers })
  if (adminDenied(user)) {
    return Response.json({ error: 'No tiene acceso a este recurso' }, { status: 403, headers })
  }

  const params = new URL(request.url).searchParams
  const claves = [...params.keys()]
  const repetida = claves.length !== new Set(claves).size
  const parsed = repetida ? null : consultaAuditoriaSchema.safeParse(Object.fromEntries(params))
  if (!parsed?.success) return Response.json({ error: 'Filtros inválidos' }, { status: 400, headers })

  await migrarDb()
  return Response.json(await consultarAuditoria(parsed.data), { headers })
}
