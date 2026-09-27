// Adapter "no disponible todavía" de PuertoAislamiento.
//
// Fuente real que lo reemplaza: índice de aislamiento OSM de G1
// (infra_aislamiento_osm, aún no mergeado). Al integrar, N1 conecta el adapter
// real de G1 a este puerto (ver docs/ejecucion-enos/E3b/registro.md).
//
// Contrato: null ≠ 'sin_datos_red'. 'sin_datos_red' es un caso DISTINTO que G1
// puede devolver cuando SÍ corrió el cálculo pero no encontró ruta; null es
// "el adapter real ni siquiera existe todavía". Nunca lanza.
import type { NivelAislamiento, PuertoAislamiento } from '../puertos'

export function crearAdapterAislamientoNoDisponible(): PuertoAislamiento {
  return {
    async obtenerIndice(_cueAnexo: string): Promise<NivelAislamiento | null> {
      return null
    },
  }
}
