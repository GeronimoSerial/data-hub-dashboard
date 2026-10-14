import { ensureSeeded } from '@/lib/db/seed'
import { getDb } from '@/lib/db'
import { aDtoVeredicto } from '@/lib/infraestructura/veredicto/dto'
import { historialVeredicto } from '@/lib/infraestructura/veredicto/repositorio'
import { jsonError } from '@/lib/infraestructura/respuesta-error'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'
import { respuestaGuard } from '@/lib/infraestructura/respuesta-guard'
import { getSessionUser, staffGuard } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CABECERAS_ERROR = { 'Cache-Control': 'private, no-store' }

function esFechaValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const ms = Date.parse(`${valor}T00:00:00Z`)
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === valor
}

export async function GET(request: Request) {
  await ensureSeeded()

  const user = await getSessionUser()
  const guard = staffGuard(user)
  if (guard) return respuestaGuard(guard)

  const params = new URL(request.url).searchParams
  const fecha = params.get('fecha')
  const ambito = params.get('ambito')

  if (!fecha || !esFechaValida(fecha)) {
    return jsonError('fecha es obligatoria y debe tener formato YYYY-MM-DD', 400, CABECERAS_ERROR)
  }
  if (!ambito) {
    return jsonError('ambito es obligatorio', 400, CABECERAS_ERROR)
  }

  // Llega ordenado de la más reciente a la más antigua: la primera es la versión mayor.
  const filas = await historialVeredicto(getDb(), { fecha, ambito })
  const total = filas.length
  return jsonNoStore({
    versiones: filas.map((fila, indice) => aDtoVeredicto(fila, total - indice)),
  })
}
