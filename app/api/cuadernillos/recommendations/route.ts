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
  // Optional only for a planning actor, who reads recommendations without a cabecera (direct shipments).
  cabeceraCueAnexo: z.string().regex(/^\d{9}$/).optional(),
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
    // A repeated cabecera is invalid, not absent: it must not fall through to the planning-only path.
    cabeceraCueAnexo: cabeceraValues.length === 0 ? undefined : cabeceraValues.length === 1 ? cabeceraValues[0] : null,
    campaignId: campaignValues.length === 1 ? campaignValues[0] : undefined,
  })
  if (!parsed.success) {
    return Response.json({ error: 'Parámetros inválidos' }, { status: 400, headers: NO_STORE })
  }

  // The recipient school needs no assignment; the actor must be the requesting cabecera, planning (it builds the remitos) or admin.
  // Without a cabecera only planning qualifies: planning is global, so the recipient cue is only a valid argument for the check.
  const { cueAnexo, cabeceraCueAnexo, campaignId } = parsed.data
  const allowed = cabeceraCueAnexo === undefined
    ? await canAccessSchool(actor, cueAnexo, 'planning')
    : await canAccessSchool(actor, cabeceraCueAnexo, 'cabecera') || await canAccessSchool(actor, cabeceraCueAnexo, 'planning')
  if (!allowed) {
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
