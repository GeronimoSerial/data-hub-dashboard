export interface EscuelaApta {
  cueAnexo: string
  nombre: string
  lat: number
  lon: number
}

export interface CandidatoOsm {
  cueAnexo: string
  // Distancia por camino (OSM) desde la escuela de origen.
  distanciaM: number
}

export interface DestinoElegido {
  cueAnexo: string
  nombre: string
  distanciaRectaM: number
  // null cuando no hay ruta OSM precomputada hacia este destino.
  distanciaRutaM: number | null
}

const RADIO_TIERRA_M = 6_371_000

export function distanciaRectaM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(lat2 - lat1)
  const dLon = rad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(a)))
}

// Destino = otra escuela apta hoy. Con candidatos OSM (ordenados por camino, ya
// filtrados offline por exposición estática) gana el primero que hoy siga apto;
// si ninguno lo está, cae a la apta más cercana en línea recta.
export function elegirDestino(
  origen: EscuelaApta,
  aptas: readonly EscuelaApta[],
  candidatosOsm: readonly CandidatoOsm[] = [],
): DestinoElegido | null {
  const otras = aptas.filter((a) => a.cueAnexo !== origen.cueAnexo)
  const recta = (a: EscuelaApta) => distanciaRectaM(origen.lat, origen.lon, a.lat, a.lon)
  const porCue = new Map(otras.map((a) => [a.cueAnexo, a]))

  for (const candidato of candidatosOsm) {
    const apta = porCue.get(candidato.cueAnexo)
    if (apta) {
      return { cueAnexo: apta.cueAnexo, nombre: apta.nombre, distanciaRectaM: recta(apta), distanciaRutaM: candidato.distanciaM }
    }
  }

  let mejor: DestinoElegido | null = null
  for (const apta of otras) {
    const d = recta(apta)
    if (mejor === null || d < mejor.distanciaRectaM || (d === mejor.distanciaRectaM && apta.cueAnexo < mejor.cueAnexo)) {
      mejor = { cueAnexo: apta.cueAnexo, nombre: apta.nombre, distanciaRectaM: d, distanciaRutaM: null }
    }
  }
  return mejor
}
