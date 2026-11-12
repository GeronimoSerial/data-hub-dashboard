import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { searchCriticalConsejoSchools } from '@/lib/cuadernillos/eligibility'
import { hasBookletCapability } from '@/lib/cuadernillos/permissions'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const CUE_PREFIX = /^\d{3,9}$/

async function handleGET(request: Request) {
  const actor = await getSessionUser()
  const hubDenied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (hubDenied) return hubDenied

  const cueValues = new URL(request.url).searchParams.getAll('cue')
  const cue = cueValues.length === 1 ? cueValues[0].trim() : ''
  if (!CUE_PREFIX.test(cue)) {
    return Response.json({ error: 'Parámetros inválidos' }, { status: 400, headers: NO_STORE })
  }

  if (!await hasBookletCapability(actor, 'cabecera')) {
    return Response.json({ error: 'No tiene acceso a este recurso' }, { status: 403, headers: NO_STORE })
  }

  try {
    const schools = await searchCriticalConsejoSchools(cue)
    return Response.json({ schools }, { status: 200, headers: NO_STORE })
  } catch {
    return Response.json({ error: 'No se pudieron buscar las escuelas' }, { status: 503, headers: NO_STORE })
  }
}

export const GET = ruta('cuadernillos.schools.get', handleGET)
