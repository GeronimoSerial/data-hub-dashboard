import { z } from 'zod'
import { BookletServiceError } from '@/lib/cuadernillos/inventory'
import { RemitoDispatchError } from '@/lib/cuadernillos/remito-dispatch'
import { assignFromReserve } from '@/lib/cuadernillos/reserve'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { cambioAuditado, conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
import { prepararEsquemaGe } from '@/lib/cuadernillos/ge-conexion'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }
// The cabecera is never read from the body: it is resolved from the session account, and unknown keys are rejected.
const schema = z.object({
  campaignId: z.string().trim().min(1).max(128),
  recipientCueAnexo: z.string().regex(/^\d{9}$/),
  items: z.array(z.object({ productId: z.string().trim().min(1).max(128), quantity: z.number().int().positive().safe() }).strict()).min(1).max(100),
  idempotencyKey: z.string().trim().min(1).max(128),
}).strict()

function errorResponse(error: unknown, fallback: string) {
  // `details` is also spread at the top level, the shape POST /api/cuadernillos/remitos already uses.
  if (error instanceof RemitoDispatchError) return Response.json({ error: error.code, ...error.details, details: error.details }, { status: error.status, headers: noStore })
  if (error instanceof BookletServiceError) return Response.json({ error: error.code }, { status: error.status, headers: noStore })
  return Response.json({ error: fallback }, { status: 503, headers: noStore })
}

async function handlePOST(request: Request) {
  const actor = await getSessionUser()
  const hubDenied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (hubDenied) return hubDenied
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: noStore }) }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: noStore })
  try {
    // GE schema is prepared before the audit transaction opens; if it fails the service retries and answers as before.
    await prepararEsquemaGe().catch(() => undefined)
    const assigned = await cambioAuditado(() => assignFromReserve(actor!, parsed.data), (created) => ({
      status: 201,
      objetoTipo: 'cuadernillo_remito',
      objetoId: created.remitoId,
      cueAnexo: created.recipientCueAnexo,
      metadatos: { cantidad: created.items.reduce((total, item) => total + item.quantity, 0) },
    }))
    return Response.json(assigned, { status: 201, headers: noStore })
  } catch (error) {
    return errorResponse(error, 'reserva_assign_failed')
  }
}

// An onward send is a remito dispatched out of the cabecera's reserve: it reuses the remito dispatch audit action.
export const POST = conAuditoria('cuadernillo.remito_despachar', '/api/cuadernillos/reserva/asignaciones', ruta('cuadernillos.reserva.asignaciones.post', handlePOST))
