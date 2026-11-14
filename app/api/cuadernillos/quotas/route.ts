import { z } from 'zod'
import { BookletServiceError, setQuota } from '@/lib/cuadernillos/inventory'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { cambioAuditado, conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }
const schema = z.object({
  campaignId: z.string().trim().min(1).max(128),
  cabeceraCueAnexo: z.string().regex(/^\d{9}$/),
  productId: z.string().trim().min(1).max(128),
  quantity: z.number().int().nonnegative().safe(),
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
    const quota = await cambioAuditado(() => setQuota(actor!, parsed.data), () => ({
      status: 200,
      objetoTipo: 'cuadernillo_cuota',
      objetoId: parsed.data.productId,
      cueAnexo: parsed.data.cabeceraCueAnexo,
      metadatos: { cantidad: parsed.data.quantity },
    }))
    return Response.json({ quota }, { status: 200, headers: noStore })
  } catch (error) {
    if (error instanceof BookletServiceError) return Response.json({ error: error.code }, { status: error.status, headers: noStore })
    return Response.json({ error: 'quota_update_failed' }, { status: 503, headers: noStore })
  }
}

export const POST = conAuditoria('cuadernillo.cuota_guardar', '/api/cuadernillos/quotas', ruta('cuadernillos.quotas.post', handlePOST))
