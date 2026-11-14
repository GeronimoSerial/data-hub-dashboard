import { z } from 'zod'
import { AssignmentSourceError } from '@/lib/cuadernillos/assignment-source'
import { confirmCabeceras, listCabeceras } from '@/lib/cuadernillos/cabeceras'
import { BookletServiceError } from '@/lib/cuadernillos/inventory'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { cambioAuditado, conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }

const postSchema = z.object({
  mapping: z.record(
    z.string().regex(/^\d{9}$/),
    z.object({
      supervisorUserId: z.string().trim().min(1).max(128),
      cabeceraUserId: z.string().trim().min(1).max(128),
    }).strict(),
  ),
}).strict()

function errorResponse(error: unknown) {
  if (error instanceof AssignmentSourceError || error instanceof BookletServiceError) {
    return Response.json({ error: error.code }, { status: error.status, headers: noStore })
  }
  return null
}

async function handleGET() {
  const actor = await getSessionUser()
  const hubDenied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (hubDenied) return hubDenied
  try {
    const body = await listCabeceras(actor)
    return Response.json(body, { status: 200, headers: noStore })
  } catch (error) {
    return errorResponse(error) ?? Response.json({ error: 'cabeceras_failed' }, { status: 503, headers: noStore })
  }
}

async function handlePOST(request: Request) {
  const actor = await getSessionUser()
  const hubDenied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (hubDenied) return hubDenied
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: noStore }) }
  const parsed = postSchema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: noStore })
  try {
    const result = await cambioAuditado(() => confirmCabeceras(actor, parsed.data.mapping), (confirmacion) => ({
      status: 200,
      objetoTipo: 'cuadernillo_cabecera',
      resultado: confirmacion.confirmed.length === 0 ? 'sin_cambio' : 'exito',
      metadatos: { cantidad: confirmacion.confirmed.length },
    }))
    return Response.json(result, { status: 200, headers: noStore })
  } catch (error) {
    return errorResponse(error) ?? Response.json({ error: 'cabeceras_failed' }, { status: 503, headers: noStore })
  }
}

export const GET = ruta('cuadernillos.cabeceras.get', handleGET)
export const POST = conAuditoria('cuadernillo.cabecera_guardar', '/api/cuadernillos/cabeceras', ruta('cuadernillos.cabeceras.post', handlePOST))
