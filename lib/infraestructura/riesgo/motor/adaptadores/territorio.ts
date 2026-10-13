import { eq, isNull } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { infraGeoProfile } from '@/lib/db/schema'
import { PUNTOS_RIO } from '../../puntos-rio'
import { elegirPuntoRioMasCercano, RADIO_MAXIMO_KM_DEFAULT } from '../../rio-asociacion'
import type { PerfilTerritorio, PuertoTerritorio } from '../puertos'

// Distancia geodésica (haversine, km) con el mismo radio por defecto de
// rio-asociacion (40 km) y la misma función pura: una sola regla de asociación
// escuela → punto de río en todo el repo. Más lejos de 40 km el punto deja de
// ser informativo sobre el curso de agua que afecta a la escuela, y no se
// inventa un vínculo.
//
// DECISIÓN LOCAL (documentada): el punto de río se resuelve por proximidad
// contra las coordenadas de PUNTOS_RIO, SIN polígono de cuenca
// real. El puerto (ver puertos.ts, PerfilTerritorio.puntoRioId) deja explícito
// que es una decisión local del adapter y que la curación geográfica fina es
// un follow-up. Consecuencia: una escuela costera a un río puede asociarse al
// punto de OTRO curso si ambos están dentro del radio; se acepta en v0
// porque la integración mínima exigida es Paraná + Uruguay.
function puntoRioMasCercano(lat: number, lon: number): string | null {
  const seleccion = elegirPuntoRioMasCercano(lat, lon, RADIO_MAXIMO_KM_DEFAULT, PUNTOS_RIO)
  return seleccion?.puntoRioId ?? null
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
