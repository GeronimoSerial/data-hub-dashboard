import { z } from 'zod'
import { BookletServiceError } from '@/lib/cuadernillos/inventory'
import { getSupervisorControl } from '@/lib/cuadernillos/remito-control'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }
const querySchema = z.object({
  campaignId: z.string().trim().min(1).max(128).optional(),
  onlyWithShortfall: z.enum(['true', 'false']).optional(),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.string().regex(/^\d{1,3}$/).optional(),
}).strict()
const KEYS = ['campaignId', 'onlyWithShortfall', 'cursor', 'limit']

async function handleGET(request: Request) {
  const actor = await getSessionUser()
  const hubDenied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (hubDenied) return hubDenied
  const params = new URL(request.url).searchParams
  if ([...params.keys()].some((key) => !KEYS.includes(key))) {
    return Response.json({ error: 'Parámetros inválidos' }, { status: 400, headers: noStore })
  }
  // A repeated parameter becomes null and fails validation.
  const single = (key: string) => { const all = params.getAll(key); return all.length === 0 ? undefined : all.length === 1 ? all[0] : null }
  const parsed = querySchema.safeParse(Object.fromEntries(KEYS.map((key) => [key, single(key)])))
  if (!parsed.success) return Response.json({ error: 'Parámetros inválidos' }, { status: 400, headers: noStore })
  try {
    const page = await getSupervisorControl(actor, {
      campaignId: parsed.data.campaignId,
      onlyWithShortfall: parsed.data.onlyWithShortfall === 'true',
      cursor: parsed.data.cursor,
      limit: parsed.data.limit === undefined ? undefined : Number(parsed.data.limit),
    })
    return Response.json(page, { status: 200, headers: noStore })
  } catch (error) {
    if (error instanceof BookletServiceError) return Response.json({ error: error.code }, { status: error.status, headers: noStore })
    return Response.json({ error: 'control_read_failed' }, { status: 503, headers: noStore })
  }
}

export const GET = ruta('cuadernillos.control.get', handleGET)
