// Plantilla determinista de respaldo del veredicto (sección 8.5 de la propuesta).
// Se construye sin IA: se usa cuando la salida del modelo no pasa validación.

import type { MetricaVeredicto } from './metricas'
import type { FuenteVeredicto, NivelVeredicto, TipoDia, TrazaRegla } from './reglas'
import { describirTraza } from './traza-texto'

export type ItemPlantilla = {
  fecha: string
  tipoDia: TipoDia
  ambito: string
  nivel: NivelVeredicto
  traza: TrazaRegla[]
  metricas: MetricaVeredicto[]
  fuentesAusentes: FuenteVeredicto[]
}

const ROTULO_NIVEL: Record<NivelVeredicto, string> = {
  sin_dato: 'Sin dato',
  sin_senal: 'Sin señal',
  vigilancia: 'Vigilancia',
  alerta: 'Alerta',
  severo: 'Severo',
}

const ORDEN_NIVEL: Record<NivelVeredicto, number> = {
  sin_dato: -1,
  sin_senal: 0,
  vigilancia: 1,
  alerta: 2,
  severo: 3,
}

const ROTULO_FUENTE: Record<FuenteVeredicto, string> = {
  imerg: 'lluvia satelital (IMERG)',
  prefectura: 'alturas de Prefectura',
  glofas: 'caudal pronosticado (GloFAS)',
  ensamble: 'ensamble de lluvia',
  smn: 'avisos del SMN',
}

function numero(valor: number): string {
  return valor.toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

function rotuloSenal(ref: string): string {
  if (ref.startsWith('lluvia.obs_24h')) return 'Lluvia máxima 24 h'
  if (ref.startsWith('lluvia.obs_72h')) return 'Lluvia máxima 72 h'
  if (ref.startsWith('lluvia.ens')) return 'Probabilidad del ensamble'
  if (ref.startsWith('rio.')) return 'Nivel del río'
  if (ref.startsWith('caudal.')) return 'Caudal pico'
  if (ref.startsWith('smn.')) return 'Aviso SMN'
  return ref
}

// Primera entrada de mayor nivel: la traza ya viene en orden de reglas.
function senalPrincipal(traza: TrazaRegla[], metricas: MetricaVeredicto[]): string | null {
  let principal: TrazaRegla | null = null
  for (const entrada of traza) {
    if (principal === null || ORDEN_NIVEL[entrada.nivel] > ORDEN_NIVEL[principal.nivel]) principal = entrada
  }
  if (principal === null || ORDEN_NIVEL[principal.nivel] <= ORDEN_NIVEL.sin_senal) return null
  if (principal.ref.startsWith('rio.')) return senalRio(principal, metricas)
  const etiqueta = rotuloSenal(principal.ref)
  if (principal.valor === null) return `${etiqueta}.`
  const unidad = metricas.find((m) => m.id === principal.ref)?.unidad
  return `${etiqueta}: ${numero(principal.valor)}${unidad ? ` ${unidad}` : ''}.`
}

// Mismo texto que el modal: "Prefectura Paso de los Libres (río Uruguay): 9,33 m ≥ evacuación 8,50 m."
function senalRio(entrada: TrazaRegla, metricas: MetricaVeredicto[]): string {
  return `${describirTraza(entrada, metricas)}.`
}

// Sin encabezado de fecha ni nivel: el modal, la vista pública y el PDF ya los
// muestran, y la primera oración tiene que ser la señal (se usa como resumen).
export function textoPlantilla(item: ItemPlantilla): string {
  const partes: string[] = []
  const senal = senalPrincipal(item.traza, item.metricas)
  if (senal) partes.push(senal)
  else partes.push(SIN_SENAL_TEXTO[item.nivel] ?? `${ROTULO_NIVEL[item.nivel]}.`)
  if (item.fuentesAusentes.length > 0) partes.push(`Sin datos de: ${item.fuentesAusentes.map((f) => ROTULO_FUENTE[f]).join(', ')}.`)
  return partes.join(' ')
}

const SIN_SENAL_TEXTO: Partial<Record<NivelVeredicto, string>> = {
  sin_dato: 'Sin datos suficientes para evaluar el día.',
  sin_senal: 'Sin señales en los datos disponibles.',
}
