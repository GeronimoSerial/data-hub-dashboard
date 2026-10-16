import { referencia } from '@/lib/infraestructura/datasets/memoria'
// Catálogo de estaciones SYNOP (SMN) de la provincia de Corrientes y su entorno,
// verificadas en Ogimet. Goya y Santo Tomé no publican SYNOP en Ogimet
// (comprobado el 2026-10-14), así que no figuran aquí.

export type EstacionSynop = {
  wmo: string
  nombre: string
  lat: number
  lon: number
}

export function obtenerEstacionesSynop(): readonly EstacionSynop[] { return referencia('estaciones-synop') }

const RADIO_TIERRA_KM = 6371

function distanciaKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const aRad = (grados: number) => (grados * Math.PI) / 180
  const dLat = aRad(lat2 - lat1)
  const dLon = aRad(lon2 - lon1)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aRad(lat1)) * Math.cos(aRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Estación SYNOP más cercana (haversine) dentro de `radioKm`, o null si ninguna
 * está en el radio.
 */
export function estacionSynopMasCercana(
  lat: number,
  lon: number,
  radioKm = 25,
): { estacion: EstacionSynop; distanciaKm: number } | null {
  let mejor: { estacion: EstacionSynop; distanciaKm: number } | null = null
  for (const estacion of obtenerEstacionesSynop()) {
    const d = distanciaKm(lat, lon, estacion.lat, estacion.lon)
    if (d <= radioKm && (mejor === null || d < mejor.distanciaKm)) {
      mejor = { estacion, distanciaKm: d }
    }
  }
  return mejor
}
