import { ensureSeeded } from '@/lib/db/seed'
import { tieneAccesoPublico } from '@/lib/infraestructura/acceso-publico'
import { tieneAccesoAlParteParaCue } from '@/lib/infraestructura/acceso-parte'
import { actorAuditoria, describirAuditoria } from '@/lib/infraestructura/auditoria/contexto'
import { cambioAuditado, conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
import { BorradorError, createDraft, readJsonBody } from '@/lib/infraestructura/borradores/service'
import { getReportesOfflineFeatures, reportesOfflineFlagDisabledResponse } from '@/lib/infraestructura/parte/feature-flags'
import { ruta } from '@/lib/http/ruta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }

function errorResponse(error: unknown): Response {
  if (!(error instanceof BorradorError)) throw error
  if (error.code === 'invalid') return Response.json({ code: 'validacion', campos: error.fields }, { status: 422, headers: NO_STORE })
  if (error.code === 'too_large') return Response.json({ code: 'limite', error: 'El cuerpo supera 64 KB.' }, { status: 413, headers: NO_STORE })
  if (error.code === 'conflict') return Response.json({ code: 'conflicto', revisionServidor: error.remoteRevision }, { status: 409, headers: NO_STORE })
  if (error.code === 'closed') return Response.json({ code: 'cerrado', estado: error.estado }, { status: 410, headers: NO_STORE })
  if (error.code === 'not_found') return Response.json({ error: 'Borrador no encontrado' }, { status: 404, headers: NO_STORE })
  throw error
}

async function handlePOST(request: Request) {
  if (!getReportesOfflineFeatures().borradoresSync) return reportesOfflineFlagDisabledResponse()
  let body: unknown
  try {
    body = await readJsonBody(request)
    const cue = typeof body === 'object' && body !== null && 'contexto' in body &&
      typeof body.contexto === 'object' && body.contexto !== null && 'cue' in body.contexto
      ? body.contexto.cue
      : null
    if (typeof cue !== 'string' || !/^\d{7}-\d{2}$/.test(cue)) {
      return Response.json({ code: 'validacion', campos: ['contexto.cue'] }, { status: 422, headers: NO_STORE })
    }
    if (!(await tieneAccesoAlParteParaCue(request, cue))) {
      return Response.json({ error: 'No autorizado' }, { status: 401, headers: NO_STORE })
    }
    if (tieneAccesoPublico(request)) actorAuditoria({ actorTipo: 'compartido', actorId: null, actorRol: null, viaAcceso: 'contrasena_compartida' })
    describirAuditoria({ objetoTipo: 'borrador', cueAnexo: cue })
    await ensureSeeded()
    const result = await cambioAuditado(() => createDraft(body), ({ draft, created }) => ({
      status: created ? 201 : 200,
      resultado: created ? 'exito' : 'repetido',
      objetoId: draft.draftId,
    }))
    return Response.json(result.draft, { status: result.created ? 201 : 200, headers: NO_STORE })
  } catch (error) {
    return errorResponse(error)
  }
}

export const POST = conAuditoria('borrador.crear', '/api/problematicas/parte/borradores', ruta('parte.borradores.post', handlePOST))
