import { z } from 'zod'
import { BookletRequestReadError, getBookletRequestPage } from '@/lib/cuadernillos/permissions'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }
const getSchema = z.object({
  campaignId: z.string().trim().min(1).max(128).optional(),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.string().regex(/^\d{1,3}$/).optional(),
}).strict()

async function handleGET(request: Request) {
  const actor = await getSessionUser()
  const hubDenied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (hubDenied) return hubDenied
  const params = new URL(request.url).searchParams
  if ([...params.keys()].some((key) => !['campaignId', 'cursor', 'limit'].includes(key))) {
    return Response.json({ error: 'Parámetros inválidos' }, { status: 400, headers: noStore })
  }
  const campaignIds = params.getAll('campaignId')
  const cursors = params.getAll('cursor')
  const limits = params.getAll('limit')
  const parsed = getSchema.safeParse({
    campaignId: campaignIds.length === 1 ? campaignIds[0] : campaignIds.length === 0 ? undefined : null,
    cursor: cursors.length === 1 ? cursors[0] : cursors.length === 0 ? undefined : null,
    limit: limits.length === 1 ? limits[0] : limits.length === 0 ? undefined : null,
  })
  if (!parsed.success) return Response.json({ error: 'Parámetros inválidos' }, { status: 400, headers: noStore })
  try {
    const page = await getBookletRequestPage(actor, {
      ...parsed.data,
      limit: parsed.data.limit === undefined ? undefined : Number(parsed.data.limit),
    })
    return Response.json(page, { status: 200, headers: noStore })
  } catch (error) {
    if (error instanceof BookletRequestReadError) return Response.json({ error: error.code }, { status: error.status, headers: noStore })
    return Response.json({ error: 'request_read_failed' }, { status: 503, headers: noStore })
  }
}

async function handlePOST(_request: Request) {
  const actor = await getSessionUser()
  const hubDenied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (hubDenied) return hubDenied
  return Response.json(
    { error: 'flow_retired', message: 'Booklet requests and quotas were replaced by remitos.' },
    { status: 410, headers: noStore },
  )
}

export const POST = conAuditoria('cuadernillo.solicitud_crear', '/api/cuadernillos/requests', ruta('cuadernillos.requests.post', handlePOST))
export const GET = ruta('cuadernillos.requests.get', handleGET)
