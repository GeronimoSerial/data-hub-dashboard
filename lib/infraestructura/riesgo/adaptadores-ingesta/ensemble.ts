// Adaptador de INGESTA del ensemble probabilístico.
//
// Envuelve `obtenerProbabilidadesEnsemble` (../providers/ensemble) y traduce su
// resultado real (`HazardEnsembleProbPunto[]` + `erroresPorCelda`) a la forma
// normalizada de `PuertoPronosticoEnsemble`.
//
// Es un cambio de FORMA y de nombres de campo, NUNCA de valor:
// - `variable: 'precipitacion_24h'` -> `'precipitacion_acumulada'`.
// - `validoEn` (última hora de la ventana de 24 h) -> ventana normalizada
//   `validoDesde`/`validoHasta` (`validoHasta = validoEn`).
// - `probabilidadP95/P99` -> `probabilidadSuperaP95/P99`.
// - `dispersion` -> `dispersionMm`.
// - `erroresPorCelda` -> `sinDato`.
//
// NO se toca ningún valor numérico del provider. En particular, el caso en que
// `miembrosValidos === 0` hoy devuelve `probabilidadP95/P99 = 0` literal: el
// adaptador PRESERVA ese `0` (ver PENDIENTE en `normalizarPunto`).
import { obtenerProbabilidadesEnsemble } from '../providers/ensemble'
import type { HazardEnsembleProbPunto } from '../providers/ensemble'
import type { ControladorCupoOM } from '../providers/cupo-om'
import type { PuertoPronosticoEnsemble, PuntoEnsembleProbabilistico } from './puertos'

const ACUMULADO_HORAS = 24 as const
const MS_POR_HORA = 3_600_000

export type DependenciasAdaptadorEnsemble = {
  // Reconstruye lat/lon desde `geometryRef`. Por defecto usa el mismo formato
  // `"${lat}_${lon}"` (1 decimal) que ../celda.ts y la misma reconstrucción que
  // hoy hace sync-ensemble.ts. Se deja inyectable para test y para no cablear
  // el formato del `geometryRef` dentro del puerto.
  coordenadaDeGeometryRef?: (geometryRef: string) => { lat: number; lon: number }
  // Seams de fetch/cupo del provider; el adaptador sólo los reenvía.
  fetchImpl?: typeof fetch
  apiKey?: string
  controladorCupoFactory?: (peso: number) => ControladorCupoOM
  // Seam de test: permite inyectar el provider sin red.
  obtenerProbabilidades?: typeof obtenerProbabilidadesEnsemble
}

function coordenadaDeCelda(geometryRef: string): { lat: number; lon: number } {
  // Mismo formato y misma reconstrucción que sync-ensemble.ts (`coordenadaDeCelda`).
  const [lat, lon] = geometryRef.split('_').map(Number)
  return { lat, lon }
}

// `HazardEnsembleProbPunto` sólo expone `validoEn` (la última hora de la ventana
// de 24 h). El puerto normaliza la ventana completa: `validoHasta = validoEn` y
// `validoDesde = validoEn - 23 h`. Es una derivación de forma, no altera ningún
// valor del provider.
function validoDesdeDeValidoEn(validoEn: string): string {
  const finMs = Date.parse(validoEn)
  return new Date(finMs - (ACUMULADO_HORAS - 1) * MS_POR_HORA).toISOString()
}

function normalizarPunto(punto: HazardEnsembleProbPunto): PuntoEnsembleProbabilistico {
  return {
    geometryRef: punto.geometryRef,
    variable: 'precipitacion_acumulada',
    corridaEn: punto.corridaEn,
    validoDesde: validoDesdeDeValidoEn(punto.validoEn),
    validoHasta: punto.validoEn,
    horizonteHoras: punto.horizonteHoras,
    acumuladoHoras: ACUMULADO_HORAS,
    miembrosTotal: punto.miembrosTotal,
    miembrosValidos: punto.miembrosValidos,
    // PENDIENTE (no arreglar acá): el registro.md propone `null` cuando
    // `miembrosValidos === 0`, pero el provider devuelve `0` literal y el
    // adaptador debe PRESERVAR el valor actual. Mismo criterio para
    // `dispersion` (hoy `0` con 0 o 1 miembros válidos; el tipo admite `null`).
    probabilidadSuperaP95: punto.probabilidadP95,
    probabilidadSuperaP99: punto.probabilidadP99,
    dispersionMm: punto.dispersion,
  }
}

export function crearAdaptadorEnsemble(
  dependencias: DependenciasAdaptadorEnsemble = {},
): PuertoPronosticoEnsemble {
  const resolverCoordenada = dependencias.coordenadaDeGeometryRef ?? coordenadaDeCelda
  const obtener = dependencias.obtenerProbabilidades ?? obtenerProbabilidadesEnsemble

  return {
    async obtenerProbabilidades(params) {
      const geometryRefsConCoordenada = params.geometryRefs.map((geometryRef) => ({
        geometryRef,
        ...resolverCoordenada(geometryRef),
      }))

      const resultado = await obtener({
        geometryRefsConCoordenada,
        corridaEn: params.asOf,
        acumuladoHoras: ACUMULADO_HORAS,
        // El provider espera `Map` mutable; el puerto expone `ReadonlyMap`.
        // `new Map(...)` copia las MISMAS entradas, no recalcula nada.
        umbralP95PorCelda: new Map(params.umbralesP95Mm),
        umbralP99PorCelda: new Map(params.umbralesP99Mm),
        fetchImpl: dependencias.fetchImpl,
        apiKey: dependencias.apiKey,
        controladorCupoFactory: dependencias.controladorCupoFactory,
      })

      return {
        puntos: resultado.puntos.map(normalizarPunto),
        sinDato: resultado.erroresPorCelda,
        // PENDIENTE para el cableado del job: el provider también devuelve
        // `llamadasRealizadas` para el conteo de cupo, que el puerto normalizado
        // no expone todavía. Se omite a propósito para no alterar la forma.
      }
    },
  }
}
