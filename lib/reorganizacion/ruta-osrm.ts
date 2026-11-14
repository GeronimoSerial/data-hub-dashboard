// Parseo y normalización puros del proxy de recorridos (OSRM). Sin I/O: la
// ruta HTTP se encarga de fetch, timeout y cancelación.
import { regionActiva } from '@/lib/infraestructura/region'

export interface Coordenada {
  lat: number
  lon: number
}

export interface RutaVial {
  distanciaKm: number
  duracionMin: number
  geometria: { type: 'LineString'; coordinates: [number, number][] }
}

export type ResultadoOsrm =
  | { ok: true; ruta: RutaVial }
  | { ok: false; error: 'sin_ruta_vial' | 'proveedor_no_disponible' }

// Caja de la región activa (bboxRuta de config/regiones): fuera de ella no se calcula recorrido.
export const CORRIENTES_BBOX = regionActiva().bboxRuta

const NUMERO = '(-?\\d+(?:\\.\\d+)?)'
const PAR_COORDENADAS = new RegExp(`^\\s*${NUMERO}\\s*,\\s*${NUMERO}\\s*$`)

// Acepta "lat,lon" con decimales. Devuelve null ante cualquier dato inválido
// o fuera de la caja de Corrientes.
export function parseCoordenadas(valor: string | null | undefined): Coordenada | null {
  if (!valor) return null
  const coincidencia = PAR_COORDENADAS.exec(valor)
  if (!coincidencia) return null
  const lat = Number(coincidencia[1])
  const lon = Number(coincidencia[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  const { latMin, latMax, lonMin, lonMax } = CORRIENTES_BBOX
  if (lat < latMin || lat > latMax || lon < lonMin || lon > lonMax) return null
  return { lat, lon }
}

// Construye la consulta de ruta conduciendo (OSRM usa orden lon,lat).
export function construirUrlOsrm(base: string, origen: Coordenada, destino: Coordenada): string {
  const raiz = base.replace(/\/+$/, '')
  const tramo = `${origen.lon},${origen.lat};${destino.lon},${destino.lat}`
  return `${raiz}/route/v1/driving/${tramo}?overview=full&geometries=geojson`
}

// Traduce la respuesta de OSRM. Sin ruta vial devuelve error: nunca se
// sustituye por una distancia en línea recta.
export function normalizarRespuestaOsrm(respuesta: unknown): ResultadoOsrm {
  if (!respuesta || typeof respuesta !== 'object') return { ok: false, error: 'proveedor_no_disponible' }
  const { code, routes } = respuesta as { code?: unknown; routes?: unknown }
  if (typeof code !== 'string') return { ok: false, error: 'proveedor_no_disponible' }
  if (code !== 'Ok') return { ok: false, error: 'sin_ruta_vial' }
  if (!Array.isArray(routes) || routes.length === 0) return { ok: false, error: 'sin_ruta_vial' }

  const primera = routes[0] as { distance?: unknown; duration?: unknown; geometry?: unknown } | null
  if (!primera || typeof primera !== 'object') return { ok: false, error: 'proveedor_no_disponible' }
  const { distance, duration, geometry } = primera
  if (typeof distance !== 'number' || !Number.isFinite(distance) || distance < 0) {
    return { ok: false, error: 'proveedor_no_disponible' }
  }
  if (typeof duration !== 'number' || !Number.isFinite(duration) || duration < 0) {
    return { ok: false, error: 'proveedor_no_disponible' }
  }
  const geo = geometry as { type?: unknown; coordinates?: unknown } | null
  if (!geo || geo.type !== 'LineString' || !Array.isArray(geo.coordinates)) {
    return { ok: false, error: 'proveedor_no_disponible' }
  }
  const coordinates = geo.coordinates as [number, number][]
  const valida = coordinates.every(
    (par) => Array.isArray(par) && par.length >= 2 && par.every((n) => typeof n === 'number' && Number.isFinite(n)),
  )
  if (!valida) return { ok: false, error: 'proveedor_no_disponible' }

  return {
    ok: true,
    ruta: {
      distanciaKm: Math.round(distance / 100) / 10,
      duracionMin: Math.round(duration / 60),
      geometria: { type: 'LineString', coordinates },
    },
  }
}
