// Adapter real de PuertoLluviaObservada sobre peligro/observado.ts de E3a
// (NASA GPM IMERG). Pide ambos horizontes en una sola llamada y mapea el
// resultado al shape del puerto.
//
// Contrato: null no es 0. 0 significa "se midió y no llovió"; null significa
// "no hay medición" (o cobertura insuficiente). Nunca lanza.
import { obtenerAcumuladosObservados } from '../../peligro/observado'
import type { LluviaObservadaCelda, PuertoLluviaObservada } from '../puertos'

export function crearAdapterLluvia(): PuertoLluviaObservada {
  return {
    async obtenerAcumulado(params: { geometryRef: string; asOf: string }): Promise<LluviaObservadaCelda> {
      const acumulados = await obtenerAcumuladosObservados({
        geometryRef: params.geometryRef,
        asOf: new Date(params.asOf),
      })
      const porHorizonte = new Map(acumulados.map((fila) => [fila.horizonteHoras, fila]))
      const acumulado24h = porHorizonte.get(24)
      const acumulado72h = porHorizonte.get(72)

      return {
        geometryRef: params.geometryRef,
        acumuladoMm24h: acumulado24h?.acumuladoMm ?? null,
        acumuladoMm72h: acumulado72h?.acumuladoMm ?? null,
        // Ambas ventanas terminan en el mismo gránulo ancla, así que
        // `masRecienteEn` coincide; se toma el de 72 h con fallback a 24 h.
        observadoEn: acumulado72h?.masRecienteEn ?? acumulado24h?.masRecienteEn ?? null,
      }
    },
  }
}
