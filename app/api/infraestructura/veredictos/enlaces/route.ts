import { conAuditoria, respuestaAuditada } from '@/lib/infraestructura/auditoria/servidor'
import { describirAuditoria } from '@/lib/infraestructura/auditoria/contexto'
import { ensureSeeded } from '@/lib/db/seed'
import { getDb } from '@/lib/db'
import { fechasVentana } from '@/lib/infraestructura/veredicto/entradas'
import { crearEnlace, revocarEnlacesDelDia } from '@/lib/infraestructura/veredicto/enlaces'
import { jsonError } from '@/lib/infraestructura/respuesta-error'
import { jsonNoStore } from '@/lib/infraestructura/respuesta-no-store'
import { respuestaGuard } from '@/lib/infraestructura/respuesta-guard'
import { getSessionUser, staffGuard } from '@/lib/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_DIAS = 31
const UN_DIA_MS = 86_400_000

const CABECERAS_ERROR = { 'Cache-Control': 'private, no-store' }

function esFechaValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  const ms = Date.parse(`${valor}T00:00:00Z`)
  return !Number.isNaN(ms) && new Date(ms).toISOString().slice(0, 10) === valor
}

async function leerCuerpo(request: Request): Promise<{ desde?: unknown; hasta?: unknown }> {
  try {
    const cuerpo = await request.json()
    return typeof cuerpo === 'object' && cuerpo !== null ? cuerpo : {}
  } catch {
    return {}
  }
}

async function atenderPOST(request: Request) {
  await ensureSeeded()

  const user = await getSessionUser()
  const guard = staffGuard(user)
  if (guard) return respuestaGuard(guard)

  const ahora = new Date()
  const ventana = fechasVentana(ahora)
  const cuerpo = await leerCuerpo(request)
  const desde = typeof cuerpo.desde === 'string' ? cuerpo.desde : ventana[0]!.fecha
  const hasta = typeof cuerpo.hasta === 'string' ? cuerpo.hasta : ventana[ventana.length - 1]!.fecha

  if (!esFechaValida(desde) || !esFechaValida(hasta)) {
    return jsonError('desde y hasta deben tener formato YYYY-MM-DD válido', 400, CABECERAS_ERROR)
  }
  const dias = (Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / UN_DIA_MS + 1
  if (dias < 1) {
    return jsonError('desde no puede ser posterior a hasta', 400, CABECERAS_ERROR)
  }
  if (dias > MAX_DIAS) {
    return jsonError(`El rango no puede superar ${MAX_DIAS} días`, 400, CABECERAS_ERROR)
  }

  return respuestaAuditada(async () => {
    const { token, venceEn, id } = await crearEnlace(getDb(), {
      desde,
      hasta,
      creadoPor: user!.id,
      ahora,
    })
    describirAuditoria({ objetoTipo: 'enlace', objetoId: id, metadatos: { enlaceId: id } })
    return jsonNoStore({ url: `/veredicto/compartido/${token}`, venceEn }, 201)
  })
}

async function atenderDELETE() {
  await ensureSeeded()

  const user = await getSessionUser()
  const guard = staffGuard(user)
  if (guard) return respuestaGuard(guard)

  return respuestaAuditada(async () => {
    const revocados = await revocarEnlacesDelDia(getDb(), { revocadoPor: user!.id })
    describirAuditoria({ objetoTipo: 'enlace', metadatos: { cantidad: revocados }, resultado: revocados ? 'exito' : 'sin_cambio' })
    return jsonNoStore({ revocados })
  })
}

export const POST = conAuditoria('enlace.crear', '/api/infraestructura/veredictos/enlaces', atenderPOST)

export const DELETE = conAuditoria('enlace.revocar', '/api/infraestructura/veredictos/enlaces', atenderDELETE)
