// Historial del parte (spec §15): movimientos en orden cronológico inverso.
// Mismo pipeline de guardas que GET /api/problematicas/parte (acceso
// público, ensureSeeded, CUE válido, corte vigente) — la ausencia de parte o
// de período vigente no es un error acá tampoco, es un historial vacío.
import { getDb } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { tieneAccesoAlParte } from '@/lib/infraestructura/acceso-parte'
import { normalizeCue } from '@/lib/infraestructura/cue'
import { getCorteVigente } from '@/lib/infraestructura/ge-db'
import { asegurarGeAdjuntada } from '@/lib/infraestructura/impacto'
import { listarMovimientosDescritos } from '@/lib/infraestructura/parte-consulta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE_HEADERS = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  if (!(await tieneAccesoAlParte(request))) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  await ensureSeeded()

  const { searchParams } = new URL(request.url)
  const cue = normalizeCue(searchParams.get('cue') ?? '')
  if (!cue) {
    return Response.json({ error: 'CUE inválido' }, { status: 400 })
  }

  const db = getDb()
  const client = db.$client
  await asegurarGeAdjuntada(client)

  const corte = await getCorteVigente(client)
  if (!corte) {
    return Response.json({ error: 'No hay un corte vigente de Gestión Educativa' }, { status: 503 })
  }

  const movimientos = await listarMovimientosDescritos(cue.value, corte.id)

  return Response.json({ ok: true, movimientos }, { status: 200, headers: CACHE_HEADERS })
}
