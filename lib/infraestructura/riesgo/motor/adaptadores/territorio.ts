import { eq, isNull } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraGeoProfile } from '@/lib/db/schema'
import { PUNTOS_RIO } from '../../puntos-rio'
import type { PerfilTerritorio, PuertoTerritorio } from '../puertos'

// Distancia euclidiana simple en grados (no haversine): a esta latitud y para
// este uso (asociar la escuela al punto de río más cercano sobre la misma
// cuenca) el error frente a una distancia geodésica es despreciable. 0.75° es
// el umbral decidido localmente en este batch (~80 km en esta latitud) para no
// inventar un vínculo cuando la escuela cae lejos de todos los puntos.
const UMBRAL_RIO_GRADOS = 0.75

// DECISIÓN LOCAL (documentada): el punto de río se resuelve por proximidad
// euclidiana contra las coordenadas de PUNTOS_RIO, SIN polígono de cuenca
// real. El puerto (ver puertos.ts, PerfilTerritorio.puntoRioId) deja explícito
// que es una decisión local del adapter y que la curación geográfica fina es
// un follow-up. Consecuencia: una escuela costera a un río puede asociarse al
// punto de OTRO curso si ambos están a menos del umbral; se acepta en v0
// porque la integración mínima exigida es Paraná + Uruguay.
function puntoRioMasCercano(lat: number, lon: number): string | null {
  let mejorId: string | null = null
  let mejorDistancia = Number.POSITIVE_INFINITY
  for (const punto of PUNTOS_RIO) {
    const distancia = Math.sqrt((lat - punto.lat) ** 2 + (lon - punto.lon) ** 2)
    if (distancia < mejorDistancia) {
      mejorDistancia = distancia
      mejorId = punto.id
    }
  }
  if (mejorId === null || mejorDistancia > UMBRAL_RIO_GRADOS) return null
  return mejorId
}

export function crearAdapterTerritorio(): PuertoTerritorio {
  return {
    async obtenerPerfil(cueAnexo: string): Promise<PerfilTerritorio | null> {
      const db = getDb()
      const [fila] = await db
        .select()
        .from(infraGeoProfile)
        .where(eq(infraGeoProfile.cueAnexo, cueAnexo))
        .limit(1)
      if (!fila) return null

      const puntoRioId =
        fila.lat === null || fila.lon === null
          ? null
          : puntoRioMasCercano(Number(fila.lat), Number(fila.lon))

      return {
        cueAnexo: fila.cueAnexo,
        geometryRef: fila.geometryRef,
        departamento: fila.departamento,
        puntoRioId,
        motivoExclusion: fila.motivoExclusion,
      }
    },

    async listarCuesConPerfil(): Promise<string[]> {
      const db = getDb()
      const filas = await db
        .select({ cueAnexo: infraGeoProfile.cueAnexo })
        .from(infraGeoProfile)
        .where(isNull(infraGeoProfile.motivoExclusion))
      return filas.map((fila) => fila.cueAnexo)
    },
  }
}
