// Historial del parte (spec §15): movimientos en orden cronológico inverso.
// Mismo pipeline de guardas que GET /api/problematicas/parte (acceso
// público, ensureSeeded, CUE válido, corte vigente) — la ausencia de parte o
// de período vigente no es un error acá tampoco, es un historial vacío.
import { desc, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { infraMovimiento } from '@/lib/db/schema'
import { tieneAccesoPublico } from '@/lib/infraestructura/acceso-publico'
import { normalizeCue } from '@/lib/infraestructura/cue'
import { getCorteVigente } from '@/lib/infraestructura/ge-db'
import { asegurarGeAdjuntada } from '@/lib/infraestructura/impacto'
import { describirMovimiento } from '@/lib/infraestructura/movimiento-descripcion'
import type { DiffParte } from '@/lib/infraestructura/movimiento-diff'
import { obtenerParteActual } from '@/lib/infraestructura/parte-consulta'
import type { TipoMovimiento } from '@/lib/infraestructura/trayectoria-tipos'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE_HEADERS = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  if (!tieneAccesoPublico(request)) {
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

  const actual = await obtenerParteActual(cue.value, corte.id)
  if (!actual || !actual.parte) {
    // Sin período vigente o sin parte todavía: no es un error (spec §15/§17).
    return Response.json({ ok: true, movimientos: [] }, { status: 200, headers: CACHE_HEADERS })
  }

  const filas = await db
    .select()
    .from(infraMovimiento)
    .where(eq(infraMovimiento.parteId, actual.parte.id))
    .orderBy(desc(infraMovimiento.creadaEn))

  const movimientos = filas.map((fila) => {
    const tipo = fila.tipo as TipoMovimiento
    return {
      id: fila.id,
      tipo,
      rol: fila.rol,
      creadaEn: fila.creadaEn,
      rigeDesde: fila.rigeDesde,
      cambios: describirMovimiento(fila.resumen as unknown as DiffParte, { tipo }),
    }
  })

  return Response.json({ ok: true, movimientos }, { status: 200, headers: CACHE_HEADERS })
}
