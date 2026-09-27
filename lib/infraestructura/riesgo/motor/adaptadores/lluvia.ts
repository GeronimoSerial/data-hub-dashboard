// Adapter "no disponible todavía" de PuertoLluviaObservada.
//
// Fuente real que lo reemplaza: lluvia/observada.ts de E3a (IMERG, batch
// hermano, otro worktree, aún no mergeado). Al integrar, N1 conecta el adapter
// real de E3a a este puerto (ver docs/ejecucion-enos/E3b/registro.md).
//
// Contrato: null no es 0. 0 significa "se midió y no llovió"; null significa
// "no hay medición". Nunca lanza.
import type { LluviaObservadaCelda, PuertoLluviaObservada } from '../puertos'

export function crearAdapterLluviaNoDisponible(): PuertoLluviaObservada {
  return {
    async obtenerAcumulado(params: { geometryRef: string; asOf: string }): Promise<LluviaObservadaCelda> {
      return {
        geometryRef: params.geometryRef,
        acumuladoMm24h: null,
        acumuladoMm72h: null,
        observadoEn: null,
      }
    },
  }
}
