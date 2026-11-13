import { z } from 'zod'
import { approveRequest } from '@/lib/cuadernillos/approvals'
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
    const approval = await cambioAuditado(() => approveRequest(actor!, { requestId: id, ...parsed.data }), () => ({
      status: 200,
      objetoTipo: 'cuadernillo_solicitud',
      objetoId: id,
      metadatos: { cantidad: parsed.data.lines.reduce((total, line) => total + line.quantity, 0) },
    }))
    return Response.json({ approval }, { status: 200, headers: noStore })
  } catch (error) {
    if (error instanceof BookletServiceError) return Response.json({ error: error.code }, { status: error.status, headers: noStore })
    return Response.json({ error: 'approval_failed' }, { status: 503, headers: noStore })
  }
}

export const POST = conAuditoria('cuadernillo.solicitud_aprobar', '/api/cuadernillos/requests/[id]/approve', ruta('cuadernillos.requests.approve.post', handlePOST))
