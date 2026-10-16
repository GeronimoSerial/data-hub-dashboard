import { eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { infraAdjunto, infraMovimiento, infraParte } from '@/lib/db/schema'
import { tieneAccesoAlParteParaCue } from '@/lib/infraestructura/acceso-parte'
import { confirmarAdjunto } from '@/lib/infraestructura/adjuntos/confirmacion'
import { getReportesOfflineFeatures, reportesOfflineFlagDisabledResponse } from '@/lib/infraestructura/parte/feature-flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const ETAG = /^(?:W\/)?"?[\da-f-]{1,128}"?$/i

type RouteContext = { params: Promise<{ attachmentId: string }> }

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  if (!getReportesOfflineFeatures().fotos) return reportesOfflineFlagDisabledResponse()
  const { attachmentId } = await context.params
  if (!/^[0-9a-f-]{36}$/i.test(attachmentId)) {
    return Response.json({ code: 'validacion', error: 'Invalid attachment identifier.' }, { status: 422, headers: NO_STORE })
  }

  let body: unknown
  try {
    const raw = await request.text()
    if (new TextEncoder().encode(raw).byteLength > 4096) {
      return Response.json({ code: 'limite' }, { status: 413, headers: NO_STORE })
    }
    body = JSON.parse(raw)
  } catch {
    return Response.json({ code: 'validacion', error: 'The request body must be valid JSON.' }, { status: 400, headers: NO_STORE })
  }
  if (typeof body !== 'object' || body === null || !('movimientoId' in body)
    || typeof body.movimientoId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.movimientoId)
    || ('optimizadaEtag' in body && (typeof body.optimizadaEtag !== 'string' || !ETAG.test(body.optimizadaEtag)))
    || ('miniaturaEtag' in body && (typeof body.miniaturaEtag !== 'string' || !ETAG.test(body.miniaturaEtag)))) {
    return Response.json({ code: 'validacion', campos: ['movimientoId', 'optimizadaEtag', 'miniaturaEtag'] }, { status: 422, headers: NO_STORE })
  }

  const { movimientoId, optimizadaEtag, miniaturaEtag } = body as {
    movimientoId: string
    optimizadaEtag?: string
    miniaturaEtag?: string
  }
  try {
    await ensureSeeded()
    const [movement] = await getDb().select({ cueAnexo: infraParte.cueAnexo })
      .from(infraAdjunto)
      .innerJoin(infraMovimiento, eq(infraAdjunto.movimientoId, infraMovimiento.id))
      .innerJoin(infraParte, eq(infraMovimiento.parteId, infraParte.id))
      .where(eq(infraAdjunto.id, attachmentId)).limit(1)
    if (!movement) return Response.json({ code: 'not_found' }, { status: 404, headers: NO_STORE })
    if (!(await tieneAccesoAlParteParaCue(request, movement.cueAnexo))) {
      return Response.json({ code: 'session_expired' }, { status: 401, headers: NO_STORE })
    }

    const result = await confirmarAdjunto({ attachmentId, movimientoId, optimizadaEtag, miniaturaEtag })
    if (!result.ok) return Response.json({ code: result.code, missingVariants: result.missingVariants }, { status: result.status, headers: NO_STORE })
    return Response.json({
      attachmentId,
      movimientoId,
      estado: 'confirmed',
      repetido: result.repetido,
      optimizadaEtag: result.optimizadaEtag,
      miniaturaEtag: result.miniaturaEtag,
    }, { status: 200, headers: NO_STORE })
  } catch {
    return Response.json({ code: 'obs_error', error: 'The photo objects could not be verified.' }, { status: 502, headers: NO_STORE })
  }
}
