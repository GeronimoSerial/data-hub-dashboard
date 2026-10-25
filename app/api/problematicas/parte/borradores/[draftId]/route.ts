import { ensureSeeded } from '@/lib/db/seed'
import { tieneAccesoAlParteParaCue } from '@/lib/infraestructura/acceso-parte'
import { BorradorError, getDraft, getDraftCue, readJsonBody, syncDraft } from '@/lib/infraestructura/borradores/service'
import { getReportesOfflineFeatures, reportesOfflineFlagDisabledResponse } from '@/lib/infraestructura/parte/feature-flags'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
type Context = { params: Promise<{ draftId: string }> }

function errorResponse(error: unknown): Response {
  if (!(error instanceof BorradorError)) throw error
  if (error.code === 'invalid') return Response.json({ code: 'validacion', campos: error.fields }, { status: 422, headers: NO_STORE })
  if (error.code === 'too_large') return Response.json({ code: 'limite', error: 'El cuerpo supera 64 KB.' }, { status: 413, headers: NO_STORE })
  if (error.code === 'conflict') return Response.json({ code: 'conflicto', revisionServidor: error.remoteRevision }, { status: 409, headers: NO_STORE })
  if (error.code === 'closed') return Response.json({ code: 'cerrado', estado: error.estado }, { status: 410, headers: NO_STORE })
  if (error.code === 'not_found') return Response.json({ error: 'Borrador no encontrado' }, { status: 404, headers: NO_STORE })
  throw error
}

async function authorize(request: Request, draftId: string): Promise<Response | null> {
  await ensureSeeded()
  const cue = await getDraftCue(draftId)
  if (!cue) return Response.json({ error: 'Borrador no encontrado' }, { status: 404, headers: NO_STORE })
  if (!(await tieneAccesoAlParteParaCue(request, cue))) {
    return Response.json({ error: 'No autorizado' }, { status: 401, headers: NO_STORE })
  }
  return null
}

async function handleGET(request: Request, context: Context) {
  try {
    const { draftId } = await context.params
    const denied = await authorize(request, draftId)
    if (denied) return denied
    return Response.json(await getDraft(draftId), { status: 200, headers: NO_STORE })
  } catch (error) {
    return errorResponse(error)
  }
}

async function handlePUT(request: Request, context: Context) {
  if (!getReportesOfflineFeatures().borradoresSync) return reportesOfflineFlagDisabledResponse()
  try {
    const { draftId } = await context.params
    const denied = await authorize(request, draftId)
    if (denied) return denied
    const body = await readJsonBody(request)
    const result = await syncDraft(draftId, body)
    return Response.json(result, { status: 200, headers: NO_STORE })
  } catch (error) {
    return errorResponse(error)
  }
}

export const GET = ruta('parte.borradores.draftId.get', handleGET)
export const PUT = ruta('parte.borradores.draftId.put', handlePUT)
