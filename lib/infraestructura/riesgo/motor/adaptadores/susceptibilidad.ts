// Adapter "no disponible todavía" de PuertoSusceptibilidad.
//
// Fuente real que lo reemplaza: indicadores physrisk estáticos de G1
// (infra_susceptibilidad_estatica, aún no mergeado). Al integrar, N1 conecta el
// adapter real de G1 a este puerto (ver docs/ejecucion-enos/E3b/registro.md).
//
// Contrato: null es "no hay indicadores calculados", no un promedio neutro.
// Nunca lanza.
import type { IndicadoresSusceptibilidad, PuertoSusceptibilidad } from '../puertos'

export function crearAdapterSusceptibilidadNoDisponible(): PuertoSusceptibilidad {
  return {
    async obtenerIndicadores(_cueAnexo: string): Promise<IndicadoresSusceptibilidad | null> {
      return null
    },
  }
}
