import { z } from 'zod'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { getEnrollmentRecommendations } from '@/lib/cuadernillos/enrollment'
import { canAccessSchool } from '@/lib/cuadernillos/permissions'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const querySchema = z.object({
  cueAnexo: z.string().regex(/^\d{9}$/),
  cabeceraCueAnexo: z.string().regex(/^\d{9}$/),
  campaignId: z.string().trim().min(1).max(128),
})

async function handleGET(request: Request) {
  const actor = await getSessionUser()
  const hubDenied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (hubDenied) return hubDenied

  const searchParams = new URL(request.url).searchParams
  const cueValues = searchParams.getAll('cueAnexo')
  const cabeceraValues = searchParams.getAll('cabeceraCueAnexo')
  const campaignValues = searchParams.getAll('campaignId')
  const parsed = querySchema.safeParse({
    cueAnexo: cueValues.length === 1 ? cueValues[0] : undefined,
    cabeceraCueAnexo: cabeceraValues.length === 1 ? cabeceraValues[0] : undefined,
    campaignId: campaignValues.length === 1 ? campaignValues[0] : undefined,
  })
  if (!parsed.success) {
    return Response.json({ error: 'Parámetros inválidos' }, { status: 400, headers: NO_STORE })
  }

  // The recipient school needs no assignment; the actor must be the requesting cabecera (or admin).
  const { cueAnexo, cabeceraCueAnexo, campaignId } = parsed.data
  if (!await canAccessSchool(actor, cabeceraCueAnexo, 'cabecera')) {
    return Response.json({ error: 'No tiene acceso a este recurso' }, { status: 403, headers: NO_STORE })
  }

  try {
    const recommendations = await getEnrollmentRecommendations(cueAnexo, campaignId)
    return Response.json({ recommendations }, { status: 200, headers: NO_STORE })
  } catch {
    return Response.json({ error: 'No se pudieron obtener las recomendaciones' }, { status: 503, headers: NO_STORE })
  }
}

export const GET = ruta('cuadernillos.recommendations.get', handleGET)
