import { z } from 'zod'
import { addStock, BookletServiceError } from '@/lib/cuadernillos/inventory'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { cambioAuditado, conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }
const schema = z.object({
  campaignId: z.string().trim().min(1).max(128),
  productId: z.string().trim().min(1).max(128),
  quantity: z.number().int().positive().safe(),
  movement: z.enum(['initial', 'replenishment']),
  idempotencyKey: z.string().trim().min(1).max(128),
}).strict()

async function handlePOST(request: Request) {
  const actor = await getSessionUser()
  const hubDenied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (hubDenied) return hubDenied
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: noStore }) }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: noStore })
  try {
    const stock = await cambioAuditado(() => addStock(actor!, parsed.data), () => ({
      status: 200,
      objetoTipo: 'cuadernillo_stock',
      objetoId: parsed.data.productId,
      metadatos: { cantidad: parsed.data.quantity },
    }))
    return Response.json({ stock }, { status: 200, headers: noStore })
  } catch (error) {
    if (error instanceof BookletServiceError) return Response.json({ error: error.code }, { status: error.status, headers: noStore })
    return Response.json({ error: 'stock_update_failed' }, { status: 503, headers: noStore })
  }
}

export const POST = conAuditoria('cuadernillo.stock_guardar', '/api/cuadernillos/stock', ruta('cuadernillos.stock.post', handlePOST))
