// Adapter "no disponible todavía" de PuertoPeligro (Capa 1 + caudal).
//
// Fuente real que lo reemplaza: peligro/nivel.ts y peligro/caudal.ts de E3a
// (batch hermano, otro worktree, aún no mergeado). Al integrar, N1 conecta el
// adapter real de E3a a este puerto (ver docs/ejecucion-enos/E3b/registro.md).
//
// Contrato: nunca lanza, nunca imputa un valor neutro de bajo riesgo. Devuelve
// el valor explícito de ausencia ('sin_dato' | null) para que motor/calculo.ts
// lo trate como confianza degradada.
import type {
  HorizontePeligro,
  NivelCaudalPunto,
  NivelPeligroCelda,
  PuertoPeligro,
} from '../puertos'

export function crearAdapterPeligroNoDisponible(): PuertoPeligro {
  return {
    async obtenerNivelesCelda(params: {
      geometryRef: string
      horizontes: readonly HorizontePeligro[]
      asOf: string
    }): Promise<NivelPeligroCelda[]> {
      return params.horizontes.map((horizonteHoras) => ({
        geometryRef: params.geometryRef,
        horizonteHoras,
        nivel: 'sin_dato',
        base: 'sin_dato',
        probabilidadP95: null,
        probabilidadP99: null,
        precipitacionMm: null,
        percentilReferencia: null,
        emitidoEn: params.asOf,
        validoHasta: params.asOf,
        versionRegla: 'peligro-no-disponible-v0',
      }))
    },

    async obtenerNivelCaudal(params: { puntoId: string; asOf: string }): Promise<NivelCaudalPunto | null> {
      // No es null: el motor distingue "existe una fila con nivel sin_dato" de
      // "no existe punto configurado". Como todavía no sabemos si el punto es
      // válido, devolver la fila con sin_dato es lo correcto según el contrato.
      return {
        puntoId: params.puntoId,
        percentilActual: null,
        nivel: 'sin_dato',
        emitidoEn: params.asOf,
        validoHasta: params.asOf,
      }
    },
  }
}
