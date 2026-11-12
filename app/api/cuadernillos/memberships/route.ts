import { z } from 'zod'
import { BookletServiceError } from '@/lib/cuadernillos/inventory'
import { grant, listMemberships, searchUsers } from '@/lib/cuadernillos/memberships'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const noStore = { 'Cache-Control': 'private, no-store' }
const grantSchema = z.object({
  userId: z.string().trim().min(1).max(128),
  capability: z.enum(['planning', 'cabecera', 'supervisor']),
}).strict()

function serviceErrorResponse(error: unknown) {
  if (error instanceof BookletServiceError) return Response.json({ error: error.code }, { status: error.status, headers: noStore })
  return null
}

async function handleGET(request: Request) {
  const actor = await getSessionUser()
  const hubDenied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (hubDenied) return hubDenied

  const searchParams = new URL(request.url).searchParams
  if ([...searchParams.keys()].some((key) => key !== 'q')) {
    return Response.json({ error: 'Parámetros inválidos' }, { status: 400, headers: noStore })
  }
  const queryValues = searchParams.getAll('q')
  if (queryValues.length > 1 || (queryValues.length === 1 && queryValues[0].length > 200)) {
    return Response.json({ error: 'Parámetros inválidos' }, { status: 400, headers: noStore })
  }
  try {
    if (queryValues.length === 1) {
      const users = await searchUsers(actor!, queryValues[0])
      return Response.json({ users }, { status: 200, headers: noStore })
    }
    const memberships = await listMemberships(actor!)
    return Response.json({ memberships }, { status: 200, headers: noStore })
  } catch (error) {
    return serviceErrorResponse(error) ?? Response.json({ error: 'memberships_failed' }, { status: 503, headers: noStore })
  }
}

async function handlePOST(request: Request) {
  const actor = await getSessionUser()
  const hubDenied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (hubDenied) return hubDenied
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: noStore }) }
  const parsed = grantSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: noStore })
  try {
    const membership = await grant(actor!, parsed.data.userId, parsed.data.capability)
    return Response.json({ membership }, { status: 201, headers: noStore })
  } catch (error) {
    return serviceErrorResponse(error) ?? Response.json({ error: 'memberships_failed' }, { status: 503, headers: noStore })
  }
}

export const GET = ruta('cuadernillos.memberships.get', handleGET)
export const POST = ruta('cuadernillos.memberships.post', handlePOST)
