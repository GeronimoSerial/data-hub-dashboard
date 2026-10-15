import { ensureSeeded } from '@/lib/db/seed'
import { tieneAccesoAlParteParaCue } from '@/lib/infraestructura/acceso-parte'
import { BorradorError, discardDraft, getDraftCue, readJsonBody } from '@/lib/infraestructura/borradores/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
type Context = { params: Promise<{ draftId: string }> }

export async function POST(request: Request, context: Context) {
  try {
    await ensureSeeded()
    const { draftId } = await context.params
    const cue = await getDraftCue(draftId)
    if (!cue) return Response.json({ error: 'Borrador no encontrado' }, { status: 404, headers: NO_STORE })
    if (!(await tieneAccesoAlParteParaCue(request, cue))) {
      return Response.json({ error: 'No autorizado' }, { status: 401, headers: NO_STORE })
    }
    const result = await discardDraft(draftId, await readJsonBody(request))
    return Response.json(result, { status: 200, headers: NO_STORE })
  } catch (error) {
    if (!(error instanceof BorradorError)) throw error
    if (error.code === 'invalid') return Response.json({ code: 'validacion', campos: error.fields }, { status: 422, headers: NO_STORE })
    if (error.code === 'too_large') return Response.json({ code: 'limite', error: 'El cuerpo supera 64 KB.' }, { status: 413, headers: NO_STORE })
    if (error.code === 'conflict') return Response.json({ code: 'conflicto', revisionServidor: error.remoteRevision }, { status: 409, headers: NO_STORE })
    if (error.code === 'closed') return Response.json({ code: 'cerrado', estado: error.estado }, { status: 410, headers: NO_STORE })
    if (error.code === 'not_found') return Response.json({ error: 'Borrador no encontrado' }, { status: 404, headers: NO_STORE })
    throw error
  }
}
