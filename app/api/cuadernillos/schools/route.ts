import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { searchCriticalConsejoSchools } from '@/lib/cuadernillos/eligibility'
import { hasBookletCapability } from '@/lib/cuadernillos/permissions'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const CUE_PREFIX = /^\d{3,9}$/
const NAME_QUERY = /^[^\d<>]{3,60}$/u

async function handleGET(request: Request) {
  const actor = await getSessionUser()
  const hubDenied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (hubDenied) return hubDenied

  // One lookup, two ways to type it: CUE digits (`cue`) or part of the school name (`q`).
  const params = new URL(request.url).searchParams
  const cueValues = params.getAll('cue')
  const textValues = params.getAll('q')
  const cue = cueValues.length === 1 ? cueValues[0].trim() : ''
  const text = textValues.length === 1 ? textValues[0].trim() : ''
  const byCue = cueValues.length === 1 && textValues.length === 0 && CUE_PREFIX.test(cue)
  const byText = textValues.length === 1 && cueValues.length === 0 && NAME_QUERY.test(text)
  if (!byCue && !byText) {
    return Response.json({ error: 'Parámetros inválidos' }, { status: 400, headers: NO_STORE })
  }

  // Planning builds the remitos, so it searches destination schools like a cabecera does.
  if (!await hasBookletCapability(actor, 'cabecera') && !await hasBookletCapability(actor, 'planning')) {
    return Response.json({ error: 'No tiene acceso a este recurso' }, { status: 403, headers: NO_STORE })
  }

  try {
    const schools = await searchCriticalConsejoSchools(byCue ? cue : text)
    return Response.json({ schools }, { status: 200, headers: NO_STORE })
  } catch {
    return Response.json({ error: 'No se pudieron buscar las escuelas' }, { status: 503, headers: NO_STORE })
  }
}

export const GET = ruta('cuadernillos.schools.get', handleGET)
