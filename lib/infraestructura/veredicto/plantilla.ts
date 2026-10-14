// Plantilla determinista de respaldo del veredicto (sección 8.5 de la propuesta).
// Se construye sin IA: se usa cuando la salida del modelo no pasa validación.

import type { MetricaVeredicto } from './metricas'
import type { FuenteVeredicto, NivelVeredicto, TipoDia, TrazaRegla } from './reglas'

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

const ROTULO_TIPO: Record<TipoDia, string> = {
  observado: 'observado',
  hoy: 'hoy',
  pronostico: 'pronóstico',
}

const ORDEN_NIVEL: Record<NivelVeredicto, number> = {
  sin_dato: -1,
  sin_senal: 0,
  vigilancia: 1,
  alerta: 2,
  severo: 3,
}

function fechaLegible(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-')
  return `${dia}/${mes}/${anio}`
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
  const etiqueta = rotuloSenal(principal.ref)
  if (principal.valor === null) return `${etiqueta}.`
  const unidad = metricas.find((m) => m.id === principal.ref)?.unidad
  return `${etiqueta}: ${principal.valor}${unidad ? ` ${unidad}` : ''}.`
}

export function textoPlantilla(item: ItemPlantilla): string {
  const partes = [`${fechaLegible(item.fecha)} (${ROTULO_TIPO[item.tipoDia]}) — ${ROTULO_NIVEL[item.nivel]}.`]
  const senal = senalPrincipal(item.traza, item.metricas)
  if (senal) partes.push(senal)
  if (item.fuentesAusentes.length > 0) partes.push(`Fuentes ausentes: ${item.fuentesAusentes.join(', ')}.`)
  return partes.join(' ')
}
