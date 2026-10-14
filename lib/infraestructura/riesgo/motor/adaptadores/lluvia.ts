// Adapter real de PuertoLluviaObservada. Combina dos fuentes:
// - NASA GPM IMERG (peligro/observado.ts de E3a), satelital, en toda la grilla.
// - Lluvia MEDIDA en estaciones SMN (SYNOP 6RRRt vía Ogimet, tabla
//   lluvia_estacion). IMERG subestima la llovizna persistente (Corrientes,
//   13/10/2026: la estación midió 4.8 mm en 24 h, IMERG ~0.7 mm), así que para
//   celdas a <= RADIO_SYNOP_KM de una estación se prefiere la medición, por
//   ventana, cuando su cobertura es completa (ver acumulado-synop.ts); si no,
//   queda IMERG. La fuente usada se informa en fuente24h/fuente72h.
//
// Contrato: null no es 0. 0 significa "se midió y no llovió"; null significa
// "no hay medición" (o cobertura insuficiente). Nunca lanza.
import { getDb } from '@/lib/db'
import { acumularSynop } from '@/lib/infraestructura/lluvia-estaciones/acumulado-synop'
import { estacionSynopMasCercana } from '@/lib/infraestructura/lluvia-estaciones/estaciones-synop'
import { obtenerLluviaSynop } from '@/lib/infraestructura/lluvia-estaciones/lluvia-repo'
import type { PrecipitacionSynop } from '@/lib/infraestructura/lluvia-estaciones/synop-parser'
import { obtenerAcumuladosObservados } from '../../peligro/observado'
import type { LluviaObservadaCelda, PuertoLluviaObservada } from '../puertos'

const FUENTE_IMERG = 'nasa-imerg'
export const RADIO_SYNOP_KM = 25
// 72 h de ventana + margen para el período que termina en la hora sinóptica previa.
const HORAS_CARGA_SYNOP = 80

type CargarSynop = (params: { estacionWmo: string; desde: string; hasta: string }) => Promise<PrecipitacionSynop[]>

const cargarSynopDesdeDb: CargarSynop = (params) => obtenerLluviaSynop(getDb(), params)

// geometryRef de la grilla 0.1° = "<lat>_<lon>" del centro de celda.
function coordenadasDeCelda(geometryRef: string): { lat: number; lon: number } | null {
  const partes = geometryRef.split('_')
  if (partes.length !== 2) return null
  const lat = Number(partes[0])
  const lon = Number(partes[1])
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
}

export function crearAdapterLluvia(deps: { cargarSynop?: CargarSynop } = {}): PuertoLluviaObservada {
  const cargarSynop = deps.cargarSynop ?? cargarSynopDesdeDb
  // Una consulta por (estación, asOf) por instancia: muchas celdas comparten estación.
  const cache = new Map<string, Promise<PrecipitacionSynop[]>>()

  async function registrosSynop(estacionWmo: string, asOf: string): Promise<PrecipitacionSynop[]> {
    const clave = `${estacionWmo}|${asOf}`
    let pendiente = cache.get(clave)
    if (pendiente === undefined) {
      const desde = new Date(Date.parse(asOf) - HORAS_CARGA_SYNOP * 3_600_000).toISOString()
      pendiente = cargarSynop({ estacionWmo, desde, hasta: asOf }).catch(() => [])
      cache.set(clave, pendiente)
    }
    return pendiente
  }

  return {
    async obtenerAcumulado(params: { geometryRef: string; asOf: string }): Promise<LluviaObservadaCelda> {
      const acumulados = await obtenerAcumuladosObservados({
        geometryRef: params.geometryRef,
        asOf: new Date(params.asOf),
      })
      const porHorizonte = new Map(acumulados.map((fila) => [fila.horizonteHoras, fila]))
      const acumulado24h = porHorizonte.get(24)
      const acumulado72h = porHorizonte.get(72)

      const celda: LluviaObservadaCelda = {
        geometryRef: params.geometryRef,
        acumuladoMm24h: acumulado24h?.acumuladoMm ?? null,
        acumuladoMm72h: acumulado72h?.acumuladoMm ?? null,
        // Ambas ventanas terminan en el mismo gránulo ancla, así que
        // `masRecienteEn` coincide; se toma el de 72 h con fallback a 24 h.
        observadoEn: acumulado72h?.masRecienteEn ?? acumulado24h?.masRecienteEn ?? null,
      }
      if (celda.acumuladoMm24h !== null) celda.fuente24h = FUENTE_IMERG
      if (celda.acumuladoMm72h !== null) celda.fuente72h = FUENTE_IMERG

      const coordenadas = coordenadasDeCelda(params.geometryRef)
      const cercana = coordenadas
        ? estacionSynopMasCercana(coordenadas.lat, coordenadas.lon, RADIO_SYNOP_KM)
        : null
      if (cercana === null) return celda

      const registros = await registrosSynop(cercana.estacion.wmo, params.asOf)
      const fuente = `synop:${cercana.estacion.wmo}:${cercana.estacion.nombre}:${cercana.distanciaKm.toFixed(1)}km`
      const synop24 = acumularSynop(registros, params.asOf, 24)
      const synop72 = acumularSynop(registros, params.asOf, 72)
      if (synop24 !== null) {
        celda.acumuladoMm24h = synop24.acumuladoMm
        celda.fuente24h = fuente
      }
      if (synop72 !== null) {
        celda.acumuladoMm72h = synop72.acumuladoMm
        celda.fuente72h = fuente
      }
      const ultimaSynop = synop72?.observadoEn ?? synop24?.observadoEn ?? null
      if (ultimaSynop !== null && (celda.observadoEn === null || ultimaSynop > celda.observadoEn)) {
        celda.observadoEn = ultimaSynop
      }
      return celda
    },
  }
}
