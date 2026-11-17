import { z } from 'zod'
import { BookletServiceError } from '@/lib/cuadernillos/inventory'
import { dispatchRemito, listRemitosForPlanning, RemitoDispatchError } from '@/lib/cuadernillos/remito-dispatch'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { cambioAuditado, conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
import { prepararEsquemaGe } from '@/lib/cuadernillos/ge-conexion'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }
const cue = z.string().regex(/^\d{9}$/)
const remitoBase = {
  campaignId: z.string().trim().min(1).max(128),
  idempotencyKey: z.string().trim().min(1).max(128),
  lines: z.array(z.object({
    recipientCueAnexo: cue,
    items: z.array(z.object({ productId: z.string().trim().min(1).max(128), quantity: z.number().int().positive().safe() }).strict()).min(1).max(100),
  }).strict()).min(1).max(200),
}
// Zod cannot default a discriminator, so a missing `modo` is a cabecera body: existing clients keep working.
// A directo body has no cabecera, and the strict objects reject one that carries it.
const schema = z.union([
  z.object({ ...remitoBase, modo: z.literal('cabecera').optional(), cabeceraCueAnexo: cue }).strict(),
  z.object({ ...remitoBase, modo: z.literal('directo') }).strict(),
])
const getSchema = z.object({
  campaignId: z.string().trim().min(1).max(128).optional(),
  cursor: z.string().min(1).max(512).optional(),
  limit: z.string().regex(/^\d{1,3}$/).optional(),
}).strict()

function errorResponse(error: unknown, fallback: string) {
  if (error instanceof RemitoDispatchError) return Response.json({ error: error.code, ...error.details }, { status: error.status, headers: noStore })
  if (error instanceof BookletServiceError) return Response.json({ error: error.code }, { status: error.status, headers: noStore })
  return Response.json({ error: fallback }, { status: 503, headers: noStore })
}

async function handleGET(request: Request) {
  const actor = await getSessionUser()
  const hubDenied = await hubApiAccessResponse(actor, '/cuadernillos')
  if (hubDenied) return hubDenied
  const params = new URL(request.url).searchParams
  if ([...params.keys()].some((key) => !['campaignId', 'cursor', 'limit'].includes(key))) {
    return Response.json({ error: 'Parámetros inválidos' }, { status: 400, headers: noStore })
  }
  const one = (name: string) => { const all = params.getAll(name); return all.length === 1 ? all[0] : all.length === 0 ? undefined : null }
  const parsed = getSchema.safeParse({ campaignId: one('campaignId'), cursor: one('cursor'), limit: one('limit') })
  if (!parsed.success) return Response.json({ error: 'Parámetros inválidos' }, { status: 400, headers: noStore })
  try {
    const page = await listRemitosForPlanning(actor, {
      ...parsed.data,
      limit: parsed.data.limit === undefined ? undefined : Number(parsed.data.limit),
    })
    return Response.json(page, { status: 200, headers: noStore })
  } catch (error) {
    return errorResponse(error, 'remito_read_failed')
  }
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
    const remito = await cambioAuditado(() => dispatchRemito(actor!, parsed.data), (created) => ({
      status: 201,
      objetoTipo: 'cuadernillo_remito',
      objetoId: created.remitoId,
      // A directo remito has no cabecera, so the audit's school field is null; the remito id identifies it.
      cueAnexo: created.cabeceraCueAnexo,
      metadatos: { cantidad: created.lines.reduce((total, line) => total + line.items.reduce((sum, item) => sum + item.quantity, 0), 0) },
    }))
    return Response.json({ remito }, { status: 201, headers: noStore })
  } catch (error) {
    return errorResponse(error, 'remito_dispatch_failed')
  }
}

export const POST = conAuditoria('cuadernillo.remito_despachar', '/api/cuadernillos/remitos', ruta('cuadernillos.remitos.post', handlePOST))
export const GET = ruta('cuadernillos.remitos.get', handleGET)
