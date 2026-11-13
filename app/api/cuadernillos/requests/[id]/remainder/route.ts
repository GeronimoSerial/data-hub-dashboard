import { z } from 'zod'
import { createRemainderRequest, getRequestChain } from '@/lib/cuadernillos/remainders'
import { BookletServiceError } from '@/lib/cuadernillos/inventory'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { prepararEsquemaGe } from '@/lib/cuadernillos/ge-conexion'
import { cambioAuditado, conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }
const schema = z.object({
  lines: z.array(z.object({ productId: z.string().trim().min(1).max(128), quantity: z.number().int().positive().safe() }).strict()).min(1).max(100),
  idempotencyKey: z.string().trim().min(1).max(128),
}).strict()

async function handlePOST(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getSessionUser()
  const denied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (denied) return denied
  const { id } = await context.params
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: noStore }) }
  const parsed = schema.safeParse(body)
  if (!parsed.success || !id.trim()) return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: noStore })
  try {
    // Esquema GE antes de abrir la auditoría; si falla, el servicio lo reintenta y responde como antes.
    await prepararEsquemaGe().catch(() => undefined)
    const result = await cambioAuditado(() => createRemainderRequest(actor!, { rootRequestId: id, ...parsed.data }), (creada) => ({
      status: 201,
      objetoTipo: 'cuadernillo_solicitud',
      objetoId: creada.requestId,
      cueAnexo: creada.recipientCueAnexo,
      metadatos: { cantidad: parsed.data.lines.reduce((total, line) => total + line.quantity, 0) },
    }))
    return Response.json({ request: result }, { status: 201, headers: noStore })
  } catch (error) {
    if (error instanceof BookletServiceError) return Response.json({ error: error.code }, { status: error.status, headers: noStore })
    return Response.json({ error: 'remainder_create_failed' }, { status: 503, headers: noStore })
  }
}

async function handleGET(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getSessionUser()
  const denied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (denied) return denied
  const { id } = await context.params
  if (!id.trim() || new URL(request.url).search) {
    return Response.json({ error: 'Parámetros inválidos' }, { status: 400, headers: noStore })
  }
  try {
    const chain = await getRequestChain(actor, id)
    return Response.json(chain, { status: 200, headers: noStore })
  } catch (error) {
    if (error instanceof BookletServiceError) return Response.json({ error: error.code }, { status: error.status, headers: noStore })
    return Response.json({ error: 'remainder_read_failed' }, { status: 503, headers: noStore })
  }
}

export const POST = conAuditoria('cuadernillo.solicitud_remanente', '/api/cuadernillos/requests/[id]/remainder', ruta('cuadernillos.requests.remainder.post', handlePOST))
export const GET = ruta('cuadernillos.requests.remainder.get', handleGET)
