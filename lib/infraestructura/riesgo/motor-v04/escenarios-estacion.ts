// Escenarios de subida posible por estación para las reglas v0.4 (F3). Une
// los análogos `analogos-v2` (historia A5, p90 de la subida máxima en la
// ventana) con la tendencia y la onda aguas arriba de las lecturas de
// Prefectura (motor/escenarios-subida.ts). Módulo puro, sin DB ni reloj.
// Ver docs/motor-v0.4/auditoria-v03.md (F3).
import { CATALOGO_A5 } from '@/lib/infraestructura/hidrometria/ina/catalogo-a5'
import { regionActiva } from '@/lib/infraestructura/region'
import type { HorizontePeligro } from '../motor/puertos'
import {
  combinarEscenarios,
  subidaDeterminista,
  type EscenarioSubidaEstacion,
  type LecturaPrefectura,
} from '../motor/escenarios-subida'
import { cuantilesMaximo, crearSerieDiaria, type FilaDiaria, type SerieDiaria } from './hidrologia/analogos'
import { estimarAnalogosV2 } from './hidrologia/analogos-v2'
import { fechaLocal } from './superacion-terreno'
import { nivelEnSitio, type UbicacionRio } from './transferencia-nivel'

const HORIZONTES: readonly HorizontePeligro[] = [24, 72, 240]

/**
 * p90 de (máximo en la ventana − nivel actual) entre los K análogos de
 * `analogos-v2`, por horizonte; null si el modelo se abstiene.
 */
export function subidaP90Analogos(serie: SerieDiaria, asOfFecha: string): Record<HorizontePeligro, number> | null {
  const e = estimarAnalogosV2(serie, asOfFecha)
  if (e.estado !== 'estimado') return null
  const salida = {} as Record<HorizontePeligro, number>
  for (const h of HORIZONTES) salida[h] = Math.round((cuantilesMaximo(e, h).p90 - e.h0M) * 1000) / 1000
  return salida
}

// Paraná aguas abajo del ancla de la región (Corrientes): la estación inmediata
// aguas arriba en el orden del catálogo (Itá Ibaté … Esquina). Aguas arriba del
// ancla la confluencia con el Paraguay y el embalse rompen el supuesto de
// propagación. Ancla ausente del catálogo del Paraná: sin onda.
export function aguasArribaOndaDeAncla(estacionAncla: string | undefined): ReadonlyMap<string, string> {
  if (!estacionAncla) return new Map()
  const parana = CATALOGO_A5.filter((e) => e.rio === 'parana').map((e) => e.estacionId)
  const desde = parana.indexOf(estacionAncla)
  if (desde === -1) return new Map()
  return new Map(parana.slice(desde + 1).map((id, k) => [id, parana[desde + k]]))
}

export const ESTACION_AGUAS_ARRIBA_ONDA: ReadonlyMap<string, string> = aguasArribaOndaDeAncla(regionActiva().estacionAncla)

/**
 * Escenario por estación del catálogo con lecturas de Prefectura o serie A5.
 * Nivel actual y tendencia: Prefectura. Análogos: serie A5 ≤ asOf.
 */
export function construirEscenariosSubida(params: {
  asOf: string
  series: ReadonlyMap<string, readonly FilaDiaria[]>
  lecturas: ReadonlyMap<string, readonly LecturaPrefectura[]>
  estacionAncla?: string
}): Map<string, EscenarioSubidaEstacion> {
  const asOfFecha = fechaLocal(params.asOf)
  const onda = aguasArribaOndaDeAncla(params.estacionAncla ?? regionActiva().estacionAncla)
  const salida = new Map<string, EscenarioSubidaEstacion>()
  for (const e of CATALOGO_A5) {
    const filas = params.series.get(e.estacionId) ?? []
    const lecturas = params.lecturas.get(e.estacionId) ?? []
    if (filas.length === 0 && lecturas.length === 0) continue
    const arriba = onda.get(e.estacionId)
    salida.set(
      e.estacionId,
      combinarEscenarios({
        estacionId: e.estacionId,
        asOf: params.asOf,
        lecturas,
        analogosP90: filas.length > 0 ? subidaP90Analogos(crearSerieDiaria(filas), asOfFecha) : null,
        aguasArriba: arriba ? { estacionId: arriba, lecturas: params.lecturas.get(arriba) ?? [] } : null,
      }),
    )
  }
  return salida
}

export type AlcanceTendencia = { alcanza: boolean; nivelSitioM: number; cotaM: number; subidaM: number }

/**
 * Zona modelada: "si se mantiene esta tendencia", cota del agua en el sitio por
 * transferencia km con el nivel actual de Prefectura de cada estación más su
 * subida determinística (tendencia media + onda), contra la cota conservadora.
 */
export function tendenciaEnSitio(
  u: Extract<UbicacionRio, { estado: 'ubicada' }>,
  escenarios: ReadonlyMap<string, EscenarioSubidaEstacion>,
  cotaConservadoraM: number,
): Record<HorizontePeligro, AlcanceTendencia> | null {
  const arriba = escenarios.get(u.aguasArriba.estacionId)
  const abajo = escenarios.get(u.aguasAbajo.estacionId)
  if (!arriba || !abajo || arriba.h0M === null || abajo.h0M === null) return null
  const salida = {} as Record<HorizontePeligro, AlcanceTendencia>
  for (const h of HORIZONTES) {
    const subidaArriba = subidaDeterminista(arriba, h)
    const subidaAbajo = subidaDeterminista(abajo, h)
    const nivelSitioM = Math.round(nivelEnSitio(u, { aguasArribaM: arriba.h0M + subidaArriba, aguasAbajoM: abajo.h0M + subidaAbajo }) * 100) / 100
    const subidaM = Math.round(((1 - u.t) * subidaArriba + u.t * subidaAbajo) * 1000) / 1000
    salida[h] = { alcanza: nivelSitioM >= cotaConservadoraM, nivelSitioM, cotaM: cotaConservadoraM, subidaM }
  }
  return salida
}
