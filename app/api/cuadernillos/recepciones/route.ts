import { listReceiptsForActor } from '@/lib/cuadernillos/remito-receipts'
import { BookletServiceError } from '@/lib/cuadernillos/inventory'
import { getSessionUser } from '@/lib/session'
import { hubApiAccessResponse } from '@/lib/hub-entry-server'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const noStore = { 'Cache-Control': 'private, no-store' }

async function handleGET() {
  const actor = await getSessionUser()
  // Receipt hub path: school operators are confined and only pass on this exact path.
  const denied = await hubApiAccessResponse(actor, '/cuadernillos/recepcion')
  if (denied) return denied
  try {
    return Response.json(await listReceiptsForActor(actor!), { status: 200, headers: noStore })
  } catch (error) {
    if (error instanceof BookletServiceError) return Response.json({ error: error.code }, { status: error.status, headers: noStore })
    return Response.json({ error: 'receipts_unavailable' }, { status: 503, headers: noStore })
  }
}

export const GET = ruta('cuadernillos.recepciones.get', handleGET)
