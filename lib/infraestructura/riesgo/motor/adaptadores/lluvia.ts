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
import { inArray } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { hazardClimatology } from '@/lib/db/schema'
import { acumularSynop } from '@/lib/infraestructura/lluvia-estaciones/acumulado-synop'
import { estacionSynopMasCercana } from '@/lib/infraestructura/lluvia-estaciones/estaciones-synop'
import { obtenerLluviaSynop } from '@/lib/infraestructura/lluvia-estaciones/lluvia-repo'
import type { PrecipitacionSynop } from '@/lib/infraestructura/lluvia-estaciones/synop-parser'
import { obtenerAcumuladosObservados } from '../../peligro/observado'
import { VARIABLE_CLIMATOLOGIA_OBSERVADA, type ClimatologiaObservada } from '../lluvia-observada'
import type { LluviaObservadaCelda, PuertoLluviaObservada } from '../puertos'

const FUENTE_IMERG = 'nasa-imerg'
export const RADIO_SYNOP_KM = 25
// 72 h de ventana + margen para el período que termina en la hora sinóptica previa.
const HORAS_CARGA_SYNOP = 80

type CargarSynop = (params: { estacionWmo: string; desde: string; hasta: string }) => Promise<PrecipitacionSynop[]>

const cargarSynopDesdeDb: CargarSynop = (params) => obtenerLluviaSynop(getDb(), params)

type ClimatologiaPorVentana = Partial<Record<24 | 72, ClimatologiaObservada>>
type CargarClimatologia = () => Promise<Map<string, ClimatologiaPorVentana>>

// Climatología observada por celda y ventana. Contrato con el job
// `calcular-climatologia-imerg` (rama climatologia-imerg): escribe percentiles
// DIARIOS de IMERG (`precipitacion_diaria`, versión `climatologia-imerg*`,
// percentiles p90/p95/p99, muestra `todos_los_dias`), que se usan para la
// ventana de 24 h. Para 72 h sólo se acepta una climatología explícita de
// acumulados de 72 h (`precipitacion_observada_72h`): los percentiles diarios
// NO valen para un acumulado de 3 días, así que sin ella quedan los umbrales
// absolutos. ERA5 (`climatologia-v*`) no se usa: es la base del pronóstico, no
// de la lluvia observada. Por celda y ventana gana la versión más reciente con
// los tres percentiles.
const VARIABLE_DIARIA_IMERG = 'precipitacion_diaria'
const PREFIJO_VERSION_IMERG = 'climatologia-imerg'

export type FilaClimatologiaObservada = {
  geometryRef: string
  variable: string
  percentil: string
  muestra: string
  valor: number
  version: string
  calculadoEn: string
  // Período de la climatología (reglas v0.4, F9). Opcional para filas viejas.
  periodoDesde?: string
  periodoHasta?: string
}

function ventanaDe(fila: FilaClimatologiaObservada): 24 | 72 | null {
  if (fila.variable === VARIABLE_DIARIA_IMERG) {
    return fila.version.startsWith(PREFIJO_VERSION_IMERG) && fila.muestra === 'todos_los_dias' ? 24 : null
  }
  if (fila.variable === VARIABLE_CLIMATOLOGIA_OBSERVADA[24]) return 24
  if (fila.variable === VARIABLE_CLIMATOLOGIA_OBSERVADA[72]) return 72
  return null
}

// `porPeriodo` (reglas v0.4, F9): el período forma parte de la clave, así dos
// períodos publicados bajo la misma versión no mezclan percentiles; entre los
// grupos completos gana el de período más reciente y luego el calculado más
// recientemente. Sin la opción, el agrupamiento de v0.3 (por versión).
export function reducirClimatologiaObservada(
  filas: readonly FilaClimatologiaObservada[],
  opciones: { porPeriodo?: boolean } = {},
): Map<string, ClimatologiaPorVentana> {
  type Grupo = { geometryRef: string; ventana: 24 | 72; version: string; calculadoEn: string; periodoHasta: string; p: Record<string, number> }
  const grupos = new Map<string, Grupo>()
  for (const fila of filas) {
    const ventana = ventanaDe(fila)
    if (ventana === null) continue
    const periodo = opciones.porPeriodo ? `|${fila.periodoDesde ?? ''}|${fila.periodoHasta ?? ''}` : ''
    const clave = `${fila.geometryRef}|${ventana}|${fila.version}${periodo}`
    const grupo = grupos.get(clave) ?? {
      geometryRef: fila.geometryRef,
      ventana,
      version: fila.version,
      calculadoEn: fila.calculadoEn,
      periodoHasta: opciones.porPeriodo ? (fila.periodoHasta ?? '') : '',
      p: {},
    }
    grupo.p[fila.percentil.toLowerCase()] = fila.valor
    if (fila.calculadoEn > grupo.calculadoEn) grupo.calculadoEn = fila.calculadoEn
    grupos.set(clave, grupo)
  }
  const salida = new Map<string, ClimatologiaPorVentana>()
  const elegidaEn = new Map<string, string>()
  for (const g of grupos.values()) {
    const { p90, p95, p99 } = g.p
    if (p90 === undefined || p95 === undefined || p99 === undefined) continue
    const claveVentana = `${g.geometryRef}|${g.ventana}`
    const previa = elegidaEn.get(claveVentana)
    // periodoHasta es '' sin la opción: el orden queda por calculadoEn (v0.3).
    const recencia = `${g.periodoHasta}|${g.calculadoEn}`
    if (previa !== undefined && previa > recencia) continue
    elegidaEn.set(claveVentana, recencia)
    const porVentana = salida.get(g.geometryRef) ?? {}
    porVentana[g.ventana] = { p90, p95, p99, version: g.version }
    salida.set(g.geometryRef, porVentana)
  }
  return salida
}

async function cargarFilasClimatologiaObservada(): Promise<FilaClimatologiaObservada[]> {
  return getDb()
    .select({
      geometryRef: hazardClimatology.geometryRef,
      variable: hazardClimatology.variable,
      percentil: hazardClimatology.percentil,
      muestra: hazardClimatology.muestra,
      valor: hazardClimatology.valor,
      version: hazardClimatology.version,
      calculadoEn: hazardClimatology.calculadoEn,
      periodoDesde: hazardClimatology.periodoDesde,
      periodoHasta: hazardClimatology.periodoHasta,
    })
    .from(hazardClimatology)
    .where(
      inArray(hazardClimatology.variable, [
        VARIABLE_DIARIA_IMERG,
        VARIABLE_CLIMATOLOGIA_OBSERVADA[24],
        VARIABLE_CLIMATOLOGIA_OBSERVADA[72],
      ]),
    )
}

export const cargarClimatologiaDesdeDb: CargarClimatologia = async () =>
  reducirClimatologiaObservada(await cargarFilasClimatologiaObservada())

// Reglas v0.4 (F9): misma carga, agrupada por período.
export const cargarClimatologiaPorPeriodoDesdeDb: CargarClimatologia = async () =>
  reducirClimatologiaObservada(await cargarFilasClimatologiaObservada(), { porPeriodo: true })

// geometryRef de la grilla 0.1° = "<lat>_<lon>" del centro de celda.
function coordenadasDeCelda(geometryRef: string): { lat: number; lon: number } | null {
  const partes = geometryRef.split('_')
  if (partes.length !== 2) return null
  const lat = Number(partes[0])
  const lon = Number(partes[1])
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
}

export function crearAdapterLluvia(
  deps: { cargarSynop?: CargarSynop; cargarClimatologia?: CargarClimatologia } = {},
): PuertoLluviaObservada {
  const cargarSynop = deps.cargarSynop ?? cargarSynopDesdeDb
  const cargarClimatologia = deps.cargarClimatologia ?? cargarClimatologiaDesdeDb
  // Una sola carga por instancia; si falla, sin climatología (umbral absoluto).
  let climatologia: Promise<Map<string, ClimatologiaPorVentana>> | null = null
  function climatologiaDe(geometryRef: string): Promise<ClimatologiaPorVentana | undefined> {
    climatologia ??= cargarClimatologia().catch(() => new Map())
    return climatologia.then((m) => m.get(geometryRef))
  }
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
      const clima = await climatologiaDe(params.geometryRef)
      celda.climatologia24h = clima?.[24] ?? null
      celda.climatologia72h = clima?.[72] ?? null
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
