// Historial de movimientos de un parte para el modal del mapa (F3.4): misma
// proyección que la ruta del director (listarMovimientosDescritos, ver
// lib/infraestructura/parte-consulta.ts) — el historial nunca llevó nombres
// de alumnos, así que no hay nada que degradar acá — pero con el acceso de
// lectura amplio del hub en vez de la cookie del director.
import { getRawClient } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { verificarAccesoLectura } from '@/lib/infraestructura/acceso-lectura'
import { normalizeCue } from '@/lib/infraestructura/cue'
import { crearEjecutorSql, getCorteVigente } from '@/lib/infraestructura/ge-db'
import { asegurarGeAdjuntada } from '@/lib/infraestructura/impacto'
import { listarMovimientosDescritos } from '@/lib/infraestructura/parte-consulta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE_HEADERS = { 'Cache-Control': 'private, no-store' }

export async function GET(request: Request) {
  const acceso = await verificarAccesoLectura()
  if (!acceso.ok) {
    return Response.json(
      { error: acceso.status === 401 ? 'No autenticado' : 'No tiene acceso a este recurso' },
      { status: acceso.status },
    )
  }

  await ensureSeeded()

  const { searchParams } = new URL(request.url)
  const cue = normalizeCue(searchParams.get('cue') ?? '')
  if (!cue) {
    return Response.json({ error: 'CUE inválido' }, { status: 400 })
  }

  const client = crearEjecutorSql(getRawClient())
  await asegurarGeAdjuntada(client)

  const corte = await getCorteVigente(client)
  if (!corte) {
    return Response.json({ error: 'No hay un corte vigente de Gestión Educativa' }, { status: 503 })
  }

  const movimientos = await listarMovimientosDescritos(cue.value, corte.id)

  return Response.json({ ok: true, movimientos }, { status: 200, headers: CACHE_HEADERS })
}
