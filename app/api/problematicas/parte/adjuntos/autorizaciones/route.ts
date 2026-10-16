import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { infraMovimiento, infraParte } from '@/lib/db/schema'
import { tieneAccesoAlParteParaCue } from '@/lib/infraestructura/acceso-parte'
import {
  authorizeAttachments,
  ObsConfigurationError,
  validateAttachmentDeclarations,
  type AttachmentDeclaration,
} from '@/lib/infraestructura/adjuntos/obs'
import { getReportesOfflineFeatures, reportesOfflineFlagDisabledResponse } from '@/lib/infraestructura/parte/feature-flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const MAX_BODY_BYTES = 16 * 1024

export async function POST(request: Request): Promise<Response> {
  if (!getReportesOfflineFeatures().fotos) return reportesOfflineFlagDisabledResponse()
  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ code: 'limite', error: 'The request body exceeds 16 KB.' }, { status: 413, headers: NO_STORE })
  }

  let body: unknown
  try {
    const rawBody = await request.text()
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return Response.json({ code: 'limite', error: 'The request body exceeds 16 KB.' }, { status: 413, headers: NO_STORE })
    }
    body = JSON.parse(rawBody)
  } catch {
    return Response.json({ code: 'validacion', error: 'The request body must be valid JSON.' }, { status: 400, headers: NO_STORE })
  }

  if (typeof body !== 'object' || body === null || !('movimientoId' in body)
    || !('adjuntos' in body) || typeof body.movimientoId !== 'string' || !validateAttachmentDeclarations(body.adjuntos)) {
    return Response.json({ code: 'validacion', campos: ['movimientoId', 'adjuntos'] }, { status: 422, headers: NO_STORE })
  }
  const requestBody = body as { movimientoId: string; adjuntos: AttachmentDeclaration[] }

  let movement: { cueAnexo: string } | undefined
  try {
    await ensureSeeded()
    const [foundMovement] = await getDb()
      .select({ cueAnexo: infraParte.cueAnexo })
      .from(infraMovimiento)
      .innerJoin(infraParte, eq(infraMovimiento.parteId, infraParte.id))
      .where(eq(infraMovimiento.id, requestBody.movimientoId))
      .limit(1)
    movement = foundMovement
  } catch {
    return Response.json({ code: 'error_interno', error: 'The movement could not be checked.' }, { status: 500, headers: NO_STORE })
  }

  if (!movement) return Response.json({ error: 'Movement not found.' }, { status: 404, headers: NO_STORE })
  if (!(await tieneAccesoAlParteParaCue(request, movement.cueAnexo))) {
    return Response.json({ code: 'session_expired', error: 'The part session is missing or expired.' }, { status: 401, headers: NO_STORE })
  }

  try {
    const autorizaciones = await authorizeAttachments(requestBody.movimientoId, movement.cueAnexo, requestBody.adjuntos)
    return Response.json({ movimientoId: requestBody.movimientoId, autorizaciones }, { status: 200, headers: NO_STORE })
  } catch (error) {
    if (error instanceof ObsConfigurationError) {
      return Response.json({ code: 'obs_configuration_error', error: 'Photo upload is not configured.' }, { status: 503, headers: NO_STORE })
    }
    return Response.json({ code: 'obs_error', error: 'OBS could not authorize the photo upload.' }, { status: 502, headers: NO_STORE })
  }
}
