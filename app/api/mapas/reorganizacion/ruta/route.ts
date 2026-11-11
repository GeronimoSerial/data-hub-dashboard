import { crearLimitador } from '@/lib/http/limitador'
import { ruta } from '@/lib/http/ruta'
import { hubApiAccessResponse, serverHubPathAllowedByExistingAcl } from '@/lib/hub-entry-server'
import { getSessionUser } from '@/lib/session'
import {
  construirUrlOsrm,
  normalizarRespuestaOsrm,
  parseCoordenadas,
  type Coordenada,
} from '@/lib/reorganizacion/ruta-osrm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RUTA_RECURSO = '/mapas/reorganizacion'
const BASE_OSRM_POR_DEFECTO = 'https://router.project-osrm.org'
const TIMEOUT_OSRM_MS = 8000
const CABECERAS = { 'Cache-Control': 'private, no-store' }

const limitador = crearLimitador({ ventanaMs: 60_000, max: 60 })

function error(status: number, codigo: string) {
  return Response.json({ error: codigo }, { status, headers: CABECERAS })
}

// Un abort por plazo llega como TimeoutError; una cancelación del cliente, como AbortError.
function esTimeout(e: unknown): boolean {
  return e instanceof Error && e.name === 'TimeoutError'
}

async function obtenerRuta(origen: Coordenada, destino: Coordenada, senal: AbortSignal) {
  const base = process.env.REORGANIZACION_OSRM_URL?.trim() || BASE_OSRM_POR_DEFECTO
  const url = construirUrlOsrm(base, origen, destino)
  const respuesta = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store', signal: senal })
  if (respuesta.status >= 500) throw new Error(`OSRM respondió ${respuesta.status}`)
  return normalizarRespuestaOsrm(await respuesta.json())
}

export const GET = ruta(
  'mapas.reorganizacion.ruta.get',
  async (request) => {
    const user = await getSessionUser()
    if (!user) return error(401, 'No autenticado')
    const denegado = await hubApiAccessResponse(user, RUTA_RECURSO)
    if (denegado) return denegado
    if (!(await serverHubPathAllowedByExistingAcl(user, RUTA_RECURSO))) {
      return error(403, 'No tiene acceso a este recurso')
    }

    const url = new URL(request.url)
    const origen = parseCoordenadas(url.searchParams.get('origen'))
    const destino = parseCoordenadas(url.searchParams.get('destino'))
    if (!origen || !destino) {
      return error(400, 'parametros_invalidos')
    }

    // Se cancela si vence el plazo o si el cliente abandona el pedido.
    const senal = AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_OSRM_MS)])
    try {
      const resultado = await obtenerRuta(origen, destino, senal)
      if (!resultado.ok) {
        return resultado.error === 'sin_ruta_vial'
          ? error(404, 'sin_ruta_vial')
          : error(502, 'proveedor_no_disponible')
      }
      return Response.json(
        {
          distanciaKm: resultado.ruta.distanciaKm,
          duracionMin: resultado.ruta.duracionMin,
          geometria: resultado.ruta.geometria,
        },
        { headers: CABECERAS },
      )
    } catch (e) {
      // 499: el cliente cerró la conexión antes de recibir respuesta.
      if (request.signal.aborted) return error(499, 'cancelado')
      if (esTimeout(e)) {
        return error(504, 'tiempo_agotado')
      }
      return error(502, 'proveedor_no_disponible')
    }
  },
  { limite: { limitador } },
)
