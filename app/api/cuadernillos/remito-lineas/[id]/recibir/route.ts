import { z } from 'zod'
import { receiveRemitoLineAtSchool } from '@/lib/cuadernillos/remito-receipts'
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
  items: z.array(item).min(1).max(100),
  shortfallReason: z.string().max(1000).optional(),
}).strict()

async function handlePOST(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await getSessionUser()
  // Receipt hub path: school operators are confined and only pass on this exact path.
  const denied = await hubApiAccessResponse(actor, '/cuadernillos/recepcion')
  if (denied) return denied
  const { id } = await context.params
  let body: unknown
  try { body = await request.json() } catch { return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: noStore }) }
  const parsed = schema.safeParse(body)
  if (!parsed.success || !id.trim()) return Response.json({ error: 'Cuerpo inválido' }, { status: 400, headers: noStore })
  try {
    const receipt = await cambioAuditado(() => receiveRemitoLineAtSchool(actor!, id, parsed.data), (signed) => ({
      status: 200,
      objetoTipo: 'cuadernillo_remito_linea',
      objetoId: signed.lineId,
      cueAnexo: actor!.cueAnexo ?? undefined,
      metadatos: { cantidad: parsed.data.items.reduce((total, entry) => total + entry.receivedQuantity, 0) },
    }))
    return Response.json({ receipt }, { status: 200, headers: noStore })
  } catch (error) {
    if (error instanceof BookletServiceError) return Response.json({ error: error.code }, { status: error.status, headers: noStore })
    return Response.json({ error: 'receipt_failed' }, { status: 503, headers: noStore })
  }
}

export const POST = conAuditoria('cuadernillo.remito_recibir_escuela', '/api/cuadernillos/remito-lineas/[id]/recibir', ruta('cuadernillos.remito-lineas.recibir.post', handlePOST))
