import { getRequestChain } from '@/lib/cuadernillos/remainders'
import { BookletServiceError } from '@/lib/cuadernillos/inventory'
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

async function handleGET(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getSessionUser()
  const denied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (denied) return denied
  const { id } = await context.params
  if (!id.trim() || new URL(request.url).search) {
    return Response.json({ error: 'Parámetros inválidos' }, { status: 400, headers: noStore })
  }
  try {
    const chain = await getRequestChain(actor, id)
    return Response.json(chain, { status: 200, headers: noStore })
  } catch (error) {
    if (error instanceof BookletServiceError) return Response.json({ error: error.code }, { status: error.status, headers: noStore })
    return Response.json({ error: 'remainder_read_failed' }, { status: 503, headers: noStore })
  }
}

export const POST = conAuditoria('cuadernillo.solicitud_remanente', '/api/cuadernillos/requests/[id]/remainder', ruta('cuadernillos.requests.remainder.post', handlePOST))
export const GET = ruta('cuadernillos.requests.remainder.get', handleGET)
