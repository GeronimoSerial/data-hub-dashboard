import { migrarDb } from '@/lib/db'
import { getSessionUser } from '@/lib/session'
import { consultaAuditoriaSchema, consultarAuditoria, decodificarCursor } from '@/lib/infraestructura/auditoria/consulta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  const user = await getSessionUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401, headers })
  if (user.banned || user.role !== 'admin') return Response.json({ error: 'No tiene acceso a este recurso' }, { status: 403, headers })
  const parsed = consultaAuditoriaSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success || (parsed.data.cursor && !decodificarCursor(parsed.data.cursor))
    || (parsed.data.desde && parsed.data.hasta && Date.parse(parsed.data.desde) >= Date.parse(parsed.data.hasta))) {
    return Response.json({ error: 'Filtros inválidos' }, { status: 400, headers })
  }
  await migrarDb()
  return Response.json(await consultarAuditoria(parsed.data), { headers })
}
