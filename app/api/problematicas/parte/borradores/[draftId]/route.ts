import { conAuditoria, respuestaAuditada } from '@/lib/infraestructura/auditoria/servidor'
import { describirAuditoria } from '@/lib/infraestructura/auditoria/contexto'
import { ensureSeeded } from '@/lib/db/seed'
import { tieneAccesoAlParteParaCue } from '@/lib/infraestructura/acceso-parte'
import { BorradorError, getDraft, getDraftCue, readJsonBody, syncDraft } from '@/lib/infraestructura/borradores/service'
import { getReportesOfflineFeatures, reportesOfflineFlagDisabledResponse } from '@/lib/infraestructura/parte/feature-flags'

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

export async function GET(request: Request, context: Context) {
  try {
    const { draftId } = await context.params
    const denied = await authorize(request, draftId)
    if (denied) return denied
    return Response.json(await getDraft(draftId), { status: 200, headers: NO_STORE })
  } catch (error) {
    return errorResponse(error)
  }
}

async function atenderPUT(request: Request, context: Context) {
  if (!getReportesOfflineFeatures().borradoresSync) return reportesOfflineFlagDisabledResponse()
  try {
    const { draftId } = await context.params
    const denied = await authorize(request, draftId)
    if (denied) return denied
    const body = await readJsonBody(request)
    describirAuditoria({ objetoTipo: 'borrador', objetoId: draftId, metadatos: { draftId } })
    return await respuestaAuditada(async () => {
      const result = await syncDraft(draftId, body)
      describirAuditoria({ metadatos: { revision: result.revision } })
      return Response.json(result, { status: 200, headers: NO_STORE })
    })
  } catch (error) {
    return errorResponse(error)
  }
}

export const PUT = conAuditoria('borrador.sincronizar', '/api/problematicas/parte/borradores/[draftId]', atenderPUT)
