// Métricas citables del veredicto diario (sección 8.1 de la propuesta).
// Sólo cifras numéricas agregadas por ámbito-día: nunca nombres de escuelas,
// texto libre de fuentes ni eventos reportados. Los ids coinciden con las
// `ref` que emiten las reglas (`reglas.ts`), para que la traza resuelva.

import type { MetricaAutorizada } from '../briefing-ia/metricas'
import type { AmbitoLluvia, LluviaObservadaAmbito } from './lluvia-observada'
import type { AvisoSmnDia, CaudalDia, EnsambleDia, LluviaPronosticadaDia } from './pronostico'
import type { RioDia } from './rios'

export type MetricaVeredicto = MetricaAutorizada & { unidad: string; fuenteUrl: string }

export const FUENTES_URL = {
  imerg: 'https://gpm.nasa.gov/data/imerg',
  prefectura: 'https://contenidosweb.prefecturanaval.gob.ar/alturas/index.php',
  glofas: 'https://open-meteo.com/en/docs/flood-api',
  ensamble: 'https://open-meteo.com/en/docs/ensemble-api',
  ecmwf: 'https://open-meteo.com/en/docs/ecmwf-api',
  smn: 'https://ssl.smn.gob.ar/CAP/AR.php',
} as const

const NOMBRE_FUENTE_POR_URL: Record<string, string> = {
  [FUENTES_URL.imerg]: 'NASA IMERG (lluvia satelital)',
  [FUENTES_URL.prefectura]: 'Prefectura Naval Argentina (alturas de ríos)',
  [FUENTES_URL.glofas]: 'GloFAS vía Open-Meteo (caudal pronosticado)',
  [FUENTES_URL.ensamble]: 'ECMWF ensamble vía Open-Meteo (lluvia pronosticada)',
  [FUENTES_URL.ecmwf]: 'ECMWF vía Open-Meteo (lluvia pronosticada)',
  [FUENTES_URL.smn]: 'Servicio Meteorológico Nacional (avisos)',
}

// Nombre legible de una fuente para listados no técnicos (PDF, vista pública).
export function nombreFuente(url: string): string {
  return NOMBRE_FUENTE_POR_URL[url] ?? url
}

export type EntradaMetricasAmbito = {
  ambito: AmbitoLluvia
  lluvia24?: LluviaObservadaAmbito
  lluvia72?: LluviaObservadaAmbito
  rios?: RioDia[]
  caudal?: CaudalDia[]
  ensamble?: EnsambleDia[]
  lluviaPronosticada?: LluviaPronosticadaDia[]
  smn?: AvisoSmnDia[]
}

const ESTADO_RIO_NUMERICO: Record<RioDia['estadoMax'], number | null> = {
  sin_dato: null,
  normal: 0,
  alerta: 1,
  evacuacion: 2,
}

const NIVEL_SMN_NUMERICO: Record<AvisoSmnDia['nivel'], number> = {
  amarillo: 1,
  naranja: 2,
  rojo: 3,
}

const redondear = (valor: number, decimales: number) => Number(valor.toFixed(decimales))

function delAmbito<T extends { departamento: string | null }>(filas: T[], ambito: AmbitoLluvia): T[] {
  if (ambito === 'provincia') return filas
  const departamento = ambito.slice('departamento:'.length)
  return filas.filter((fila) => fila.departamento === departamento)
}

function metricasLluvia(prefijo: string, lluvia: LluviaObservadaAmbito): MetricaVeredicto[] {
  return [
    { id: `${prefijo}.max_mm`, valor: redondear(lluvia.maxMm, 2), unidad: 'mm', etiqueta: `Lluvia máxima ${prefijo.slice(-3)}`, fuenteUrl: FUENTES_URL.imerg },
    { id: `${prefijo}.prom_mm`, valor: redondear(lluvia.promMm, 2), unidad: 'mm', etiqueta: `Lluvia promedio ${prefijo.slice(-3)}`, fuenteUrl: FUENTES_URL.imerg },
  ]
}

function metricasRio(rio: RioDia): MetricaVeredicto[] {
  const prefijo = `rio.${rio.estacionId}`
  const metricas: MetricaVeredicto[] = []
  const estado = ESTADO_RIO_NUMERICO[rio.estadoMax]
  if (estado !== null) {
    metricas.push({ id: `${prefijo}.estado_max`, valor: estado, unidad: 'nivel', etiqueta: `Estado del río ${rio.nombre} (0 normal, 1 alerta, 2 evacuación)`, fuenteUrl: FUENTES_URL.prefectura })
  }
  if (rio.alturaMaxM !== null) {
    metricas.push({ id: `${prefijo}.altura_max_m`, valor: redondear(rio.alturaMaxM, 2), unidad: 'm', etiqueta: `Altura máxima ${rio.nombre}`, fuenteUrl: FUENTES_URL.prefectura })
  }
  // Umbrales publicados por Prefectura: margen = umbral − altura máxima (rios.ts).
  if (rio.alturaMaxM !== null && rio.margenEvacM !== null) {
    metricas.push({ id: `${prefijo}.evacuacion_m`, valor: redondear(rio.alturaMaxM + rio.margenEvacM, 2), unidad: 'm', etiqueta: `Nivel de evacuación ${rio.nombre}`, fuenteUrl: FUENTES_URL.prefectura })
  }
  if (rio.alturaMaxM !== null && rio.margenAlertaM !== null) {
    metricas.push({ id: `${prefijo}.alerta_m`, valor: redondear(rio.alturaMaxM + rio.margenAlertaM, 2), unidad: 'm', etiqueta: `Nivel de alerta ${rio.nombre}`, fuenteUrl: FUENTES_URL.prefectura })
  }
  if (rio.tendenciaM24h !== null) {
    metricas.push({ id: `${prefijo}.tendencia_m_24h`, valor: redondear(rio.tendenciaM24h, 2), unidad: 'm', etiqueta: `Variación en 24 h ${rio.nombre}`, fuenteUrl: FUENTES_URL.prefectura })
  }
  return metricas
}

function metricasCaudal(caudal: CaudalDia): MetricaVeredicto {
  return { id: `caudal.${caudal.puntoId}.pico_m3s`, valor: redondear(caudal.picoM3s, 1), unidad: 'm3/s', etiqueta: `Caudal pico ${caudal.nombre}`, fuenteUrl: FUENTES_URL.glofas }
}

function metricaLluviaPronosticada(lluvia: LluviaPronosticadaDia): MetricaVeredicto {
  return {
    id: 'lluvia.pron_24h.max_mm',
    valor: redondear(lluvia.maxMm, 1),
    unidad: 'mm',
    etiqueta: 'Lluvia pronosticada máxima 24 h (ECMWF)',
    fuenteUrl: FUENTES_URL.ecmwf,
  }
}

function metricasEnsamble(filas: EnsambleDia[]): MetricaVeredicto[] {
  if (filas.length === 0) return []
  const p95 = Math.max(...filas.map((f) => f.probP95Max))
  const p99 = Math.max(...filas.map((f) => f.probP99Max))
  return [
    { id: 'lluvia.ens.prob_p95', valor: Math.round(p95 * 100), unidad: '%', etiqueta: 'Probabilidad del ensamble de superar p95', fuenteUrl: FUENTES_URL.ensamble },
    { id: 'lluvia.ens.prob_p99', valor: Math.round(p99 * 100), unidad: '%', etiqueta: 'Probabilidad del ensamble de superar p99', fuenteUrl: FUENTES_URL.ensamble },
  ]
}

function metricaSmn(aviso: AvisoSmnDia): MetricaVeredicto {
  return { id: `smn.${aviso.avisoId}.nivel`, valor: NIVEL_SMN_NUMERICO[aviso.nivel], unidad: 'nivel', etiqueta: `Nivel de aviso SMN (1 amarillo, 2 naranja, 3 rojo)`, fuenteUrl: FUENTES_URL.smn }
}

export function construirMetricasAmbito(entrada: EntradaMetricasAmbito): MetricaVeredicto[] {
  const { ambito } = entrada
  const metricas: MetricaVeredicto[] = []
  if (entrada.lluvia24) metricas.push(...metricasLluvia('lluvia.obs_24h', entrada.lluvia24))
  if (entrada.lluvia72) metricas.push(...metricasLluvia('lluvia.obs_72h', entrada.lluvia72))
  for (const rio of delAmbito(entrada.rios ?? [], ambito)) metricas.push(...metricasRio(rio))
  for (const caudal of delAmbito(entrada.caudal ?? [], ambito)) metricas.push(metricasCaudal(caudal))
  metricas.push(...metricasEnsamble(delAmbito(entrada.ensamble ?? [], ambito)))
  const lluvia = (entrada.lluviaPronosticada ?? []).find((x) => x.ambito === ambito)
  if (lluvia) metricas.push(metricaLluviaPronosticada(lluvia))
  for (const aviso of delAmbito(entrada.smn ?? [], ambito)) metricas.push(metricaSmn(aviso))
  return metricas
}
