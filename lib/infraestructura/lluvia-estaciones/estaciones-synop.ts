// Catálogo de estaciones SYNOP (SMN) de la provincia de Corrientes y su entorno,
// verificadas en Ogimet. Goya y Santo Tomé no publican SYNOP en Ogimet
// (comprobado el 2026-10-14), así que no figuran aquí.

export type EstacionSynop = {
  wmo: string
  nombre: string
  lat: number
  lon: number
}

export const ESTACIONES_SYNOP: readonly EstacionSynop[] = [
  { wmo: '87155', nombre: 'Resistencia Aero', lat: -27.4386, lon: -59.0458 },
  { wmo: '87166', nombre: 'Corrientes Aero', lat: -27.4497, lon: -58.7597 },
  { wmo: '87173', nombre: 'Ituzaingó', lat: -27.5856, lon: -56.6772 },
  { wmo: '87178', nombre: 'Posadas Aero', lat: -27.3908, lon: -55.9669 },
  { wmo: '87187', nombre: 'Oberá', lat: -27.4836, lon: -55.1314 },
  { wmo: '87270', nombre: 'Reconquista', lat: -29.205, lon: -59.6933 },
  { wmo: '87281', nombre: 'Mercedes', lat: -29.2261, lon: -58.0856 },
  { wmo: '87289', nombre: 'Paso de los Libres', lat: -29.6892, lon: -57.1483 },
  { wmo: '87393', nombre: 'Monte Caseros', lat: -30.2617, lon: -57.6389 },
]

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
  for (const estacion of ESTACIONES_SYNOP) {
    const d = distanciaKm(lat, lon, estacion.lat, estacion.lon)
    if (d <= radioKm && (mejor === null || d < mejor.distanciaKm)) {
      mejor = { estacion, distanciaKm: d }
    }
  }
  return mejor
}
