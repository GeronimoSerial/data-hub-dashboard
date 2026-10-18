import { ensureSeeded } from '@/lib/db/seed'
import {
  crearEvidenciaFotografica,
  ErrorEvidenciaFotografica,
  resolverMovimientoBaseEvidencia,
  type DeclaracionFoto,
} from '@/lib/infraestructura/adjuntos/evidencia-fotografica'
import { normalizeCue } from '@/lib/infraestructura/cue'
import { getReportesOfflineFeatures, reportesOfflineFlagDisabledResponse } from '@/lib/infraestructura/parte/feature-flags'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'private, no-store' }
const MAX_BODY_BYTES = 16 * 1024

export async function POST(request: Request): Promise<Response> {
  if (!getReportesOfflineFeatures().fotos) return reportesOfflineFlagDisabledResponse()
  let body: unknown
  try {
    const raw = await request.text()
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return Response.json({ code: 'limite' }, { status: 413, headers: NO_STORE })
    }
    body = JSON.parse(raw)
  } catch {
    return Response.json({ code: 'validacion' }, { status: 400, headers: NO_STORE })
  }
  if (!body || typeof body !== 'object') return Response.json({ code: 'validacion' }, { status: 422, headers: NO_STORE })
  const input = body as { movimientoBaseId?: unknown; cue?: unknown; idempotencyKey?: unknown; fotos?: unknown }
  // The school sheet may send only the CUE; the base movement is then resolved here.
  const cue = typeof input.cue === 'string' ? normalizeCue(input.cue) : null
  if ((typeof input.movimientoBaseId !== 'string' && !cue) || typeof input.idempotencyKey !== 'string'
    || !Array.isArray(input.fotos) || input.fotos.length < 1 || input.fotos.length > 3) {
    return Response.json({ code: 'validacion' }, { status: 422, headers: NO_STORE })
  }
  try {
    await ensureSeeded()
    const movimientoBaseId =
      typeof input.movimientoBaseId === 'string'
        ? input.movimientoBaseId
        : await resolverMovimientoBaseEvidencia(cue!.value)
    if (!movimientoBaseId) {
      return Response.json(
        { code: 'sin_parte', error: 'La escuela todavía no tiene un parte al que asociar fotos.' },
        { status: 404, headers: NO_STORE },
      )
    }
    const result = await crearEvidenciaFotografica(request, {
      movimientoBaseId,
      idempotencyKey: input.idempotencyKey,
      fotos: input.fotos as DeclaracionFoto[],
    })
    return Response.json({ ok: true, ...result }, { status: 200, headers: NO_STORE })
  } catch (error) {
    if (error instanceof ErrorEvidenciaFotografica) {
      return Response.json({ code: 'validacion', error: error.message }, { status: error.status, headers: NO_STORE })
    }
    return Response.json({ code: 'error_interno' }, { status: 500, headers: NO_STORE })
  }
}
