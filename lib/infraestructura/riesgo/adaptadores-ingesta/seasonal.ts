// Adaptador de INGESTA de la tendencia estacional (ENOS 30-90 días).
//
// Envuelve `obtenerTendenciaEstacional` (../providers/seasonal) y traduce su
// resultado real (`EstadisticaEstacionalDepartamento[]` +
// `erroresPorDepartamento`) a la forma normalizada de
// `PuertoTendenciaEstacional`.
//
// La forma de `EstadisticaEstacionalDepartamento` ya coincide campo a campo con
// `EstadisticaEstacionalNormalizada` (mismos nombres y mismas unidades `Mm`), así
// que la traducción es una identidad sobre las estadísticas más el renombre del
// diagnóstico `erroresPorDepartamento` -> `sinDato`. NO se altera ningún valor;
// `emisionEn`/`validoDesde`/`validoHasta` se pasan tal cual los devuelve el
// provider.
import { obtenerTendenciaEstacional } from '../providers/seasonal'
import type { ControladorCupoOM } from '../providers/cupo-om'
import type { PuertoTendenciaEstacional } from './puertos'

export type DependenciasAdaptadorSeasonal = {
  // Seams de fetch/cupo del provider; el adaptador sólo los reenvía.
  fetchImpl?: typeof fetch
  apiKey?: string
  controladorCupoFactory?: (peso: number) => ControladorCupoOM
  // Seam de test: permite inyectar el provider sin red.
  obtenerTendencia?: typeof obtenerTendenciaEstacional
}

export function crearAdaptadorSeasonal(
  dependencias: DependenciasAdaptadorSeasonal = {},
): PuertoTendenciaEstacional {
  const obtener = dependencias.obtenerTendencia ?? obtenerTendenciaEstacional

  return {
    async obtenerTendencia(params) {
      const resultado = await obtener({
        centroides: params.centroides,
        // El puerto recibe `emisionEn` como ISO UTC; el provider espera `Date`.
        emisionEn: new Date(params.emisionEn),
        horizonteDesdeDias: params.horizonteDesdeDias,
        horizonteHastaDias: params.horizonteHastaDias,
        fetchImpl: dependencias.fetchImpl,
        apiKey: dependencias.apiKey,
        controladorCupoFactory: dependencias.controladorCupoFactory,
      })

      return {
        estadisticas: resultado.estadisticas,
        sinDato: resultado.erroresPorDepartamento,
        // PENDIENTE para el cableado del job: el provider también devuelve
        // `llamadasRealizadas` para el conteo de cupo, que el puerto normalizado
        // no expone todavía. Se omite a propósito para no alterar la forma.
      }
    },
  }
}
