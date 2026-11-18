import { z } from 'zod'
import { BookletServiceError } from '@/lib/cuadernillos/inventory'
import { getReserveSummary } from '@/lib/cuadernillos/reserve'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }
const getSchema = z.object({ campaignId: z.string().trim().min(1).max(128) }).strict()

async function handleGET(request: Request) {
  const actor = await getSessionUser()
  const hubDenied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (hubDenied) return hubDenied
  const params = new URL(request.url).searchParams
  const campaignIds = params.getAll('campaignId')
  if ([...params.keys()].some((key) => key !== 'campaignId')) return Response.json({ error: 'Parámetros inválidos' }, { status: 400, headers: noStore })
  const parsed = getSchema.safeParse({ campaignId: campaignIds.length === 1 ? campaignIds[0] : undefined })
  if (!parsed.success) return Response.json({ error: 'Parámetros inválidos' }, { status: 400, headers: noStore })
  try {
    return Response.json(await getReserveSummary(actor, parsed.data.campaignId), { status: 200, headers: noStore })
  } catch (error) {
    if (error instanceof BookletServiceError) return Response.json({ error: error.code }, { status: error.status, headers: noStore })
    return Response.json({ error: 'reserva_read_failed' }, { status: 503, headers: noStore })
  }
}

export const GET = ruta('cuadernillos.reserva.get', handleGET)
