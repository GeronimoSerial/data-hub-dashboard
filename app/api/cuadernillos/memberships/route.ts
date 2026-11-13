import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '@/lib/db'
import { bookletMembership } from '@/lib/db/schema'
import { BookletServiceError } from '@/lib/cuadernillos/inventory'
import { grant, listMemberships, searchUsers } from '@/lib/cuadernillos/memberships'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { describirAuditoria } from '@/lib/infraestructura/auditoria/contexto'
import { cambioAuditado, conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
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
  describirAuditoria({ objetoTipo: 'membresia' })
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: noStore }) }
  const parsed = grantSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: noStore })
  try {
    // Una membresía activa para el mismo usuario y capacidad es un reenvío: no crea fila nueva y queda como "repetido".
    const { membership } = await cambioAuditado(async () => {
      const [activa] = await getDb()
        .select({ id: bookletMembership.id })
        .from(bookletMembership)
        .where(and(
          eq(bookletMembership.userId, parsed.data.userId),
          eq(bookletMembership.capability, parsed.data.capability),
          isNull(bookletMembership.revokedAt),
        ))
        .limit(1)
      const otorgada = await grant(actor!, parsed.data.userId, parsed.data.capability)
      return { membership: otorgada, repetido: activa !== undefined }
    }, ({ membership: otorgada, repetido: reenvio }) => ({
      status: 201,
      objetoTipo: 'membresia',
      objetoId: otorgada.id,
      resultado: reenvio ? 'repetido' : undefined,
      metadatos: { campos: ['capability'] },
    }))
    return Response.json({ membership }, { status: 201, headers: noStore })
  } catch (error) {
    return serviceErrorResponse(error) ?? Response.json({ error: 'memberships_failed' }, { status: 503, headers: noStore })
  }
}

export const GET = ruta('cuadernillos.memberships.get', handleGET)
export const POST = conAuditoria('cuadernillo.membresia_otorgar', '/api/cuadernillos/memberships', ruta('cuadernillos.memberships.post', handlePOST))
