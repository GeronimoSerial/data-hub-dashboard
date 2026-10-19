import { conAuditoria } from '@/lib/infraestructura/auditoria/servidor'
// Historial del parte (spec §15): movimientos en orden cronológico inverso.
// Mismo pipeline de guardas que GET /api/problematicas/parte (acceso
// público, ensureSeeded, CUE válido, corte vigente) — la ausencia de parte o
// de período vigente no es un error acá tampoco, es un historial vacío.
import { getRawClient } from '@/lib/db'
import { ensureSeeded } from '@/lib/db/seed'
import { codigoSinAccesoParte, tieneAccesoAlParteParaCue } from '@/lib/infraestructura/acceso-parte'
import { normalizeCue } from '@/lib/infraestructura/cue'
import { crearEjecutorSql, getCorteVigente } from '@/lib/infraestructura/ge-db'
import { asegurarGeAdjuntada } from '@/lib/infraestructura/impacto'
import { listarMovimientosDescritos } from '@/lib/infraestructura/parte-consulta'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CACHE_HEADERS = { 'Cache-Control': 'private, no-store' }

async function atenderGET(request: Request) {
  const { searchParams } = new URL(request.url)
  const cue = normalizeCue(searchParams.get('cue') ?? '')
  if (!cue) {
    return Response.json({ error: 'CUE inválido' }, { status: 400 })
  }

  // El CUE tiene que conocerse ANTES de la guarda para poder validar la
  // sesión acotada por CUE del batch E1; quien ya tenía contraseña/sesión
  // admin entra exactamente igual que antes porque tieneAccesoAlParteParaCue
  // prueba esa vía primero.
  if (!(await tieneAccesoAlParteParaCue(request, cue.value))) {
    return Response.json({ error: 'No autorizado' }, { status: await codigoSinAccesoParte() })
  }

  await ensureSeeded()

  const client = crearEjecutorSql(getRawClient())
  await asegurarGeAdjuntada(client)

  const corte = await getCorteVigente(client)
  if (!corte) {
    return Response.json({ error: 'No hay un corte vigente de Gestión Educativa' }, { status: 503 })
  }

  const movimientos = (await listarMovimientosDescritos(cue.value, corte.id)).map((movimiento) => ({
    ...movimiento,
    severidad: movimiento.severidad ?? null,
  }))

  return Response.json({ ok: true, movimientos }, { status: 200, headers: CACHE_HEADERS })
}

export const GET = conAuditoria('parte.historial', '/api/problematicas/parte/historial', atenderGET)
