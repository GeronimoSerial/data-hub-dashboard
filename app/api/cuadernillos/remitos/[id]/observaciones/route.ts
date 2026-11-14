import { z } from 'zod'
import { BookletServiceError } from '@/lib/cuadernillos/inventory'
import { addRemitoObservation } from '@/lib/cuadernillos/remito-control'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }
// Strict: author identity comes from the session, never from the body.
const schema = z.object({
  lineId: z.string().trim().min(1).max(128).optional(),
  body: z.string().trim().min(1).max(2000),
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
    const observation = await addRemitoObservation(actor!, id, parsed.data)
    return Response.json({ observation }, { status: 201, headers: noStore })
  } catch (error) {
    if (error instanceof BookletServiceError) return Response.json({ error: error.code }, { status: error.status, headers: noStore })
    return Response.json({ error: 'observation_failed' }, { status: 503, headers: noStore })
  }
}

export const POST = ruta('cuadernillos.remitos.observaciones.post', handlePOST)
