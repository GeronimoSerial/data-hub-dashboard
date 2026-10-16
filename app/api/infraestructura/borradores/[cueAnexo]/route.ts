import { ensureSeeded } from '@/lib/db/seed'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { normalizeCue } from '@/lib/infraestructura/cue'
import { listDraftsForMap, type DraftCursor } from '@/lib/infraestructura/borradores/mapa'
import { puedeVerNominal } from '@/lib/infraestructura/permiso-nominal'
import { respuestaAccesoDenegado } from '@/lib/infraestructura/respuesta-acceso-denegado'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/
type Context = { params: Promise<{ cueAnexo: string }> }

function decodeCursor(value: string | null): DraftCursor | undefined | null {
  if (!value) return undefined
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (!parsed || typeof parsed !== 'object') return null
    const cursor = parsed as Record<string, unknown>
    if (typeof cursor.actividadEn !== 'string' || !ISO_DATE.test(cursor.actividadEn) ||
      typeof cursor.draftId !== 'string' || cursor.draftId.length > 200) return null
    return { actividadEn: cursor.actividadEn, draftId: cursor.draftId }
  } catch {
    return null
  }
}

export async function GET(request: Request, context: Context) {
  await ensureSeeded()
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) return respuestaAccesoDenegado(acceso)

  const { cueAnexo: rawCue } = await context.params
  const cue = normalizeCue(rawCue)
  if (!cue || cue.kind !== 'anexo') return jsonNoStore({ error: 'CUE inválido' }, 400)

  const { searchParams } = new URL(request.url)
  const rawLimit = searchParams.get('limit')
  const limit = rawLimit === null ? DEFAULT_LIMIT : Number(rawLimit)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    return jsonNoStore({ error: `limit debe estar entre 1 y ${MAX_LIMIT}` }, 400)
  }
  const cursor = decodeCursor(searchParams.get('cursor'))
  if (cursor === null) return jsonNoStore({ error: 'Cursor inválido' }, 400)

  const ahora = new Date()
  const includeNominal = await puedeVerNominal(acceso.user, ahora)
  const result = await listDraftsForMap({
    cue: cue.value,
    cursor,
    limit,
    includeNominal,
    userId: acceso.user.id,
    ahora,
  })
  return jsonNoStore(result)
}
