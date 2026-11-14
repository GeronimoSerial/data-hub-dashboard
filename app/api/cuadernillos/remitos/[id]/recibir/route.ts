import { z } from 'zod'
import { receiveRemitoAtCabecera } from '@/lib/cuadernillos/remito-receipts'
import { BookletServiceError } from '@/lib/cuadernillos/inventory'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { cambioAuditado, conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }
const item = z.object({ productId: z.string().trim().min(1).max(128), receivedQuantity: z.number().int().min(0).safe() }).strict()
// Signer identity is never read from the body: unknown keys are rejected.
const schema = z.object({
  idempotencyKey: z.string().trim().min(1).max(128),
  lines: z.array(z.object({ lineId: z.string().trim().min(1).max(128), items: z.array(item).min(1).max(100), shortfallReason: z.string().max(1000).optional() }).strict()).min(1).max(500),
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
    const receipt = await cambioAuditado(() => receiveRemitoAtCabecera(actor!, id, parsed.data), (signed) => ({
      status: 200,
      objetoTipo: 'cuadernillo_remito',
      objetoId: signed.remitoId,
      metadatos: { cantidad: parsed.data.lines.reduce((total, line) => total + line.items.reduce((sum, item) => sum + item.receivedQuantity, 0), 0) },
    }))
    return Response.json({ receipt }, { status: 200, headers: noStore })
  } catch (error) {
    if (error instanceof BookletServiceError) return Response.json({ error: error.code }, { status: error.status, headers: noStore })
    return Response.json({ error: 'receipt_failed' }, { status: 503, headers: noStore })
  }
}

export const POST = conAuditoria('cuadernillo.remito_recibir_cabecera', '/api/cuadernillos/remitos/[id]/recibir', ruta('cuadernillos.remitos.recibir.post', handlePOST))
