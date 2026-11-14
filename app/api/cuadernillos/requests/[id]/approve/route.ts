import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }

async function handlePOST(_request: Request, _context: { params: Promise<{ id: string }> }) {
  const actor = await getSessionUser()
  const denied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (denied) return denied
  return Response.json(
    { error: 'flow_retired', message: 'Booklet requests and quotas were replaced by remitos.' },
    { status: 410, headers: noStore },
  )
}

export const POST = conAuditoria('cuadernillo.solicitud_aprobar', '/api/cuadernillos/requests/[id]/approve', ruta('cuadernillos.requests.approve.post', handlePOST))
