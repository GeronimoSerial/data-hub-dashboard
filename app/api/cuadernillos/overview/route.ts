import { z } from 'zod'
import { BookletRequestReadError } from '@/lib/cuadernillos/permissions'
import { getBookletOverviewPage } from '@/lib/cuadernillos/queries'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const querySchema = z.object({
  capability: z.enum(['planning', 'cabecera', 'supervisor']),
  campaignId: z.string().trim().min(1).max(128).optional(),
}).strict()

async function handleGET(request: Request) {
  const actor = await getSessionUser()
  const hubDenied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (hubDenied) return hubDenied

  const params = new URL(request.url).searchParams
  if ([...params.keys()].some((key) => !['capability', 'campaignId'].includes(key))) {
    return Response.json({ error: 'Parámetros inválidos' }, { status: 400, headers: NO_STORE })
  }
  const getUnique = (key: string) => {
    const values = params.getAll(key)
    return values.length === 1 ? values[0] : values.length === 0 ? undefined : null
  }
  const parsed = querySchema.safeParse({
    capability: getUnique('capability'),
    campaignId: getUnique('campaignId'),
  })
  if (!parsed.success) return Response.json({ error: 'Parámetros inválidos' }, { status: 400, headers: NO_STORE })

  try {
    const page = await getBookletOverviewPage(actor, parsed.data.capability, {
      campaignId: parsed.data.campaignId,
    })
    if (!page) return Response.json({ error: 'No tiene acceso a este recurso' }, { status: 403, headers: NO_STORE })
    return Response.json(page, { status: 200, headers: NO_STORE })
  } catch (error) {
    if (error instanceof BookletRequestReadError) {
      return Response.json({ error: error.code }, { status: error.status, headers: NO_STORE })
    }
    return Response.json({ error: 'overview_read_failed' }, { status: 503, headers: NO_STORE })
  }
}

export const GET = ruta('cuadernillos.overview.get', handleGET)
