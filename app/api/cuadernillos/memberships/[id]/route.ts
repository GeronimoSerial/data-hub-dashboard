import { BookletServiceError } from '@/lib/cuadernillos/inventory'
import { revoke } from '@/lib/cuadernillos/memberships'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { describirAuditoria } from '@/lib/infraestructura/auditoria/contexto'
import { cambioAuditado, conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }

async function handleDELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getSessionUser()
  const hubDenied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (hubDenied) return hubDenied
  const { id } = await context.params
  describirAuditoria({ objetoTipo: 'membresia', objetoId: id })
  if (!id.trim() || id.length > 128) return Response.json({ error: 'Parámetros inválidos' }, { status: 400, headers: noStore })
  try {
    const membership = await cambioAuditado(
      () => revoke(actor!, id),
      (revocada) => ({ status: 200, objetoTipo: 'membresia', objetoId: revocada.id, metadatos: { campos: ['revokedAt'] } }),
    )
    return Response.json({ membership }, { status: 200, headers: noStore })
  } catch (error) {
    if (error instanceof BookletServiceError) return Response.json({ error: error.code }, { status: error.status, headers: noStore })
    return Response.json({ error: 'memberships_failed' }, { status: 503, headers: noStore })
  }
}

export const DELETE = conAuditoria('cuadernillo.membresia_revocar', '/api/cuadernillos/memberships/[id]', ruta('cuadernillos.memberships.delete', handleDELETE))
